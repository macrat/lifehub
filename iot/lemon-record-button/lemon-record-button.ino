// レモンの世話を記録するボタン（M5Stack AtomS3R）。
//
// 画面のボタンを 1 回押すと葉水、2 回押すと葉水＋水やりを LifeHub に記録する。
// 3 回以上続けて押すと何も送らない（間違えて押したときに、そのまま連打すれば取り消せる）。
// 押されるまではライトスリープで待ち、押されたときだけ Wi-Fi に繋いで送り、すぐに眠りに戻る。
// 押してから送り終えるまで、画面に今の押し方を出す（1 回は葉、2 回は水滴、3 回以上は消す）。
//
// ディープスリープにしないのは、AtomS3R のボタン（G41）が RTC GPIO（G0〜G21）ではなく、
// ESP32-S3 のディープスリープから起こせないため。ライトスリープなら普通の GPIO の割り込みで起きられる。
// 詳しくは README.md。

#include <M5Unified.h>
#include <driver/gpio.h>
#include <esp_sleep.h>

#include <iterator>

#include "record.h"
#include "screen.h"

namespace {

constexpr gpio_num_t BUTTON = GPIO_NUM_41;  // 押すと LOW（基板で引き上げてある）

// 次の押下を待つ時間。これより間が空いたら押し終わりとみなす。
// 短いと 2 回押しが 1 回押しに割れ、長いと押し終えてから送り始めるまでが遅れる
constexpr uint32_t PRESS_WINDOW_MS = 400;
constexpr uint32_t DEBOUNCE_MS = 20;
// 記録できたことを見せる時間と、送れなかったことを見せる時間
constexpr uint32_t SUCCESS_HOLD_MS = 500;
constexpr uint32_t FAILURE_HOLD_MS = 3000;

// 押した回数ごとの記録と画面。1 回目が先頭
struct Action {
  record::Care care;
  screen::Icon icon;
};
constexpr Action ACTIONS[] = {
    {record::Care::Mist, screen::Icon::Leaf},
    {record::Care::MistAndWater, screen::Icon::Drop},
};
// 表より 1 回多く続けて押したら送らない（間違えて押したときの取り消し）
constexpr int CANCEL_PRESSES = std::size(ACTIONS) + 1;

// 押した回数の記録と画面。取り消す回数なら nullptr
const Action *actionFor(int presses) {
  return presses < CANCEL_PRESSES ? &ACTIONS[presses - 1] : nullptr;
}

bool pressed() { return gpio_get_level(BUTTON) == 0; }

// ボタンが離された状態で DEBOUNCE_MS 続くまで待つ（接点のばたつきを 1 回と数えない）
void waitReleased() {
  uint32_t since = millis();
  while (millis() - since < DEBOUNCE_MS) {
    if (pressed()) since = millis();
    delay(1);
  }
}

// 離されてから PRESS_WINDOW_MS 以内にまた押されたら true
bool waitNextPress() {
  const uint32_t released = millis();
  while (millis() - released < PRESS_WINDOW_MS) {
    if (pressed()) return true;
    delay(1);
  }
  return false;
}

// 押した回数に合わせて画面を変え、取り消しの回数に達したら送るのをやめる
void onPress(int presses) {
  if (const Action *action = actionFor(presses)) {
    screen::show(action->icon);
  } else if (presses == CANCEL_PRESSES) {
    screen::off();
    record::cancel();
  }
}

// ボタンが押されるまでライトスリープする。無線・画面・バックライトは止めてから呼ぶ。
// 起こすのは G41 の LOW だけ（タイマーでは起きない）。
void sleepUntilPressed() {
  gpio_wakeup_enable(BUTTON, GPIO_INTR_LOW_LEVEL);
  esp_sleep_enable_gpio_wakeup();
  // 眠っている間は CPU の電源も落とす（起きたときに状態は戻る）
  esp_sleep_pd_config(ESP_PD_DOMAIN_CPU, ESP_PD_OPTION_OFF);
  esp_light_sleep_start();
}

}  // namespace

void setup() {
  auto config = M5.config();
  // 使わない部品は初期化しない（IMU・マイク・スピーカー・RTC。IMU は電源投入時の低消費のまま置いておく）
  config.internal_imu = false;
  config.internal_mic = false;
  config.internal_spk = false;
  config.internal_rtc = false;
  config.external_imu = false;
  config.external_rtc = false;
  config.external_display_value = 0;
  config.external_speaker_value = 0;
  config.led_brightness = 0;
  M5.begin(config);
  screen::begin();
}

void loop() {
  // 眠る前に離されているのを待つ（押したままだと LOW のままなので、眠った瞬間に起きてしまう）
  waitReleased();
  sleepUntilPressed();

  // ノイズで起きたときは何もせずに眠り直す
  if (!pressed()) return;

  // 押し終わりを待っている間（最後に押してから 0.4 秒）に Wi-Fi の接続を進めておく
  record::connect();
  int presses = 0;
  do {
    onPress(++presses);
    waitReleased();
  } while (waitNextPress());
  // 取り消したときは連打が止まったらすぐに眠る（画面も無線も onPress で止めてある）
  const Action *action = actionFor(presses);
  if (!action) return;

  if (record::send(action->care)) {
    delay(SUCCESS_HOLD_MS);
  } else {
    screen::showFailed(action->icon);
    delay(FAILURE_HOLD_MS);
  }
  screen::off();
}
