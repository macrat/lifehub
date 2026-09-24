#include "record.h"

#include <HTTPClient.h>
#include <NetworkClientSecure.h>
#include <WiFi.h>
#include <esp_random.h>

#include "config.h"
#include "root_ca.h"

namespace {

constexpr uint32_t WIFI_TIMEOUT_MS = 10000;
// 前回の AP へ直接つなぐときの待ち時間。普段は数百 ms で繋がるので、AP が変わったときに
// 無線を長く動かしたまま待たず、早めに走査からやり直す
constexpr uint32_t CACHED_WIFI_TIMEOUT_MS = 3000;
constexpr uint32_t HTTP_TIMEOUT_MS = 10000;
constexpr int SEND_ATTEMPTS = 3;

// 前回つながったアクセスポイント。ライトスリープの間も RAM は保たれるので、次からは
// チャンネルの走査を省いて直接つなぐ（走査は数百 ms〜数秒かかり、その間は無線が電流を食う）。
bool cachedAp = false;
int32_t cachedChannel = 0;
uint8_t cachedBssid[6];

// 接続を始めた時刻（connect）。待ち時間はここから数える
uint32_t connectStartedAt = 0;

bool waitConnected(uint32_t timeoutMs) {
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - connectStartedAt > timeoutMs) return false;
    delay(10);
  }
  return true;
}

// 接続を待つ。前回の AP へ直接つないで繋がらなければ、走査からやり直す
bool waitWifi() {
  if (cachedAp) {
    if (waitConnected(CACHED_WIFI_TIMEOUT_MS)) return true;
    // アクセスポイントが変わった（チャンネルの変更など）
    cachedAp = false;
    WiFi.disconnect();
    connectStartedAt = millis();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
  if (!waitConnected(WIFI_TIMEOUT_MS)) return false;
  cachedAp = true;
  cachedChannel = WiFi.channel();
  memcpy(cachedBssid, WiFi.BSSID(), sizeof(cachedBssid));
  return true;
}

void stopWifi() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
}

// 記録の ID（UUID v4）。送り直しても同じ ID なら、サーバーは二重に作らない。
// esp_random は無線が動いている間は真の乱数になるので、Wi-Fi に繋いだ後に作る。
String newUuid() {
  uint8_t bytes[16];
  esp_fill_random(bytes, sizeof(bytes));
  bytes[6] = (bytes[6] & 0x0F) | 0x40;  // version 4
  bytes[8] = (bytes[8] & 0x3F) | 0x80;  // variant 10
  char text[37];
  snprintf(text, sizeof(text),
           "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x", bytes[0],
           bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7], bytes[8],
           bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]);
  return String(text);
}

// 日時は送らない（サーバーが受け取った時刻で記録する）ので、時計を合わせる通信が要らない
String bodyOf(record::Care care, const String &id) {
  const char *careTypes = care == record::Care::Mist ? R"(["mist"])" : R"(["mist","water"])";
  return String(R"({"type":"lemon","id":")") + id + R"(","careTypes":)" + careTypes + "}";
}

// 201 なら記録できた。通信の失敗（負の値）とサーバーの一時的な失敗（5xx）だけを送り直す
int post(const String &body) {
  NetworkClientSecure client;
  client.setCACert(ROOT_CA);
  client.setTimeout(HTTP_TIMEOUT_MS / 1000);           // I/O タイムアウト（秒）
  client.setHandshakeTimeout(HTTP_TIMEOUT_MS / 1000);  // TLS ハンドシェイクタイムアウト（秒）
  HTTPClient http;
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);
  if (!http.begin(client, LIFEHUB_RECORDS_URL)) return -1;
  http.addHeader("Authorization", "Bearer " LIFEHUB_API_KEY);
  http.addHeader("Content-Type", "application/json");
  const int status = http.POST(body);
  http.end();
  return status;
}

}  // namespace

namespace record {

void connect() {
  WiFi.persistent(false);  // 接続情報をフラッシュに書かない（毎回書くと遅く、寿命も縮む）
  WiFi.mode(WIFI_STA);
#ifdef WIFI_STATIC_IP
  WiFi.config(IPAddress(WIFI_STATIC_IP), IPAddress(WIFI_GATEWAY), IPAddress(WIFI_SUBNET),
              IPAddress(WIFI_DNS));
#endif
  connectStartedAt = millis();
  if (cachedAp) {
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD, cachedChannel, cachedBssid);
  } else {
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
}

void cancel() { stopWifi(); }

bool send(Care care) {
  bool recorded = false;
  if (waitWifi()) {
    const String body = bodyOf(care, newUuid());
    for (int attempt = 0; attempt < SEND_ATTEMPTS; ++attempt) {
      const int status = post(body);
      recorded = status == 201;
      if (recorded || (status > 0 && status < 500)) break;
    }
  }
  stopWifi();
  return recorded;
}

}  // namespace record
