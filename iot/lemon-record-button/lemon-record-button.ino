// レモンの世話を記録するボタン（M5Stack AtomS3R）。
//
// 画面のボタンを 1 回押すと葉水、2 回押すと葉水＋水やりを LifeHub に記録する。
// 押されるまではライトスリープで待ち、押されたときだけ Wi-Fi に繋いで送り、すぐに眠りに戻る。
// 送っている間だけ画面に葉（葉水）か水滴（水やり）を出す。
//
// ディープスリープにしないのは、AtomS3R のボタン（G41）が RTC GPIO（G0〜G21）ではなく、
// ESP32-S3 のディープスリープから起こせないため。ライトスリープなら普通の GPIO の割り込みで起きられる。
// 詳しくは README.md。

#include <M5Unified.h>
#include <driver/gpio.h>
#include <esp_sleep.h>

#include "record.h"
#include "screen.h"

namespace {

constexpr gpio_num_t BUTTON = GPIO_NUM_41;  // 押すと LOW（基板で引き上げてある）

// 2 回目の押下を待つ時間。短いと 2 回押しが 1 回押しに割れ、長いと 1 回押しの反応が遅れる
constexpr uint32_t DOUBLE_PRESS_WINDOW_MS = 400;
constexpr uint32_t DEBOUNCE_MS = 20;
// 記録できたことを見せる時間と、送れなかったことを見せる時間
constexpr uint32_t SUCCESS_HOLD_MS = 500;
constexpr uint32_t FAILURE_HOLD_MS = 3000;

bool pressed() { return gpio_get_level(BUTTON) == 0; }

// ボタンが離された状態で DEBOUNCE_MS 続くまで待つ（接点のばたつきを 1 回と数えない）
void waitReleased() {
  uint32_t since = millis();
  while (millis() - since < DEBOUNCE_MS) {
    if (pressed()) since = millis();
    delay(1);
  }
}

// 押されてから待つ時間内にもう 1 度押されたら 2 回押し。押されていなければ（ノイズで起きたら）None
enum class Press { None, Single, Double };

Press readPress() {
  if (!pressed()) return Press::None;
  waitReleased();
  const uint32_t released = millis();
  while (millis() - released < DOUBLE_PRESS_WINDOW_MS) {
    if (pressed()) {
      waitReleased();
      return Press::Double;
    }
    delay(1);
  }
  return Press::Single;
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

  // 押し方を見分けている間（最大 0.4 秒）に Wi-Fi の接続を進めておく
  record::connect();
  const Press press = readPress();
  if (press == Press::None) {
    record::cancel();
    return;
  }

  const bool single = press == Press::Single;
  const screen::Icon icon = single ? screen::Icon::Leaf : screen::Icon::Drop;
  screen::show(icon);
  const bool recorded = record::send(single ? record::Care::Mist : record::Care::MistAndWater);
  if (recorded) {
    delay(SUCCESS_HOLD_MS);
  } else {
    screen::showFailed(icon);
    delay(FAILURE_HOLD_MS);
  }
  screen::off();
}
