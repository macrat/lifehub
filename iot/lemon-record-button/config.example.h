// このファイルを config.h に写して値を入れる（config.h は .gitignore 済み）。
#pragma once

// 2.4GHz の Wi-Fi（ESP32-S3 は 5GHz に繋がらない）
#define WIFI_SSID "your-ssid"
#define WIFI_PASSWORD "your-password"

// LifeHub の設定画面「外部連携」で発行した API キー
#define LIFEHUB_API_KEY "your-api-key"

// 記録投入用エンドポイント
#define LIFEHUB_RECORDS_URL "https://lifehub.crat.jp/api/records"

// 固定 IP にすると DHCP を待たずに済み、Wi-Fi に繋がっている時間（= 電池の消費）が短くなる。
// 使うなら 4 つとも書き、使わないなら行ごと消す（DHCP になる）。
// #define WIFI_STATIC_IP 192, 168, 1, 50
// #define WIFI_GATEWAY 192, 168, 1, 1
// #define WIFI_SUBNET 255, 255, 255, 0
// #define WIFI_DNS 192, 168, 1, 1
