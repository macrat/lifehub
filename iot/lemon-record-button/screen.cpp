#include "screen.h"

#include <M5Unified.h>

#include "icons.h"

namespace {

// LP5562（AtomS3R のバックライトの LED ドライバ）。I2C のアドレスと ENABLE レジスタ。
// M5GFX の setBrightness(0) は PWM を 0 にするだけでチップは動いたまま（内部の発振器が回り続ける）なので、
// CHIP_EN を落としてスタンバイ（1µA 未満）にする。
constexpr uint8_t LP5562_ADDRESS = 0x30;
constexpr uint8_t LP5562_ENABLE = 0x00;
constexpr uint8_t LP5562_CHIP_EN = 0x40;
constexpr uint32_t I2C_FREQ = 400000;

// 明るさは読める範囲で低めにする（点いている時間は数秒なので、消費への影響は小さい）
constexpr uint8_t BRIGHTNESS = 96;

// 送れなかったときはアイコンを灰色にして、赤い × を重ねる
constexpr uint16_t FAILED_COLOR = TFT_DARKGREY;

void backlight(bool on) {
  if (on) {
    M5.In_I2C.writeRegister8(LP5562_ADDRESS, LP5562_ENABLE, LP5562_CHIP_EN, I2C_FREQ);
    delay(1);  // CHIP_EN から動き出すまで 500µs 待つ（データシート）
    M5.Display.setBrightness(BRIGHTNESS);
  } else {
    M5.Display.setBrightness(0);
    M5.In_I2C.writeRegister8(LP5562_ADDRESS, LP5562_ENABLE, 0x00, I2C_FREQ);
  }
}

// アプリのレモンの画面と同じアイコンを、黒地に白（送れなかったときは灰色）で画面いっぱいに描く
void drawIcon(screen::Icon icon, bool failed) {
  const uint8_t* image = icon == screen::Icon::Leaf ? icons::MIST : icons::WATER;
  M5.Display.pushGrayscaleImage(0, 0, icons::SIZE, icons::SIZE, image, lgfx::grayscale_4bit,
                                failed ? FAILED_COLOR : TFT_WHITE, TFT_BLACK);
}

}  // namespace

namespace screen {

void begin() { off(); }

void show(Icon icon) {
  M5.Display.wakeup();
  drawIcon(icon, false);
  backlight(true);
}

void showFailed(Icon icon) {
  drawIcon(icon, true);
  M5.Display.drawWideLine(24, 24, 104, 104, 8, TFT_RED);
  M5.Display.drawWideLine(104, 24, 24, 104, 8, TFT_RED);
}

void off() {
  backlight(false);
  M5.Display.sleep();  // パネルを SLEEP IN にする（表示用のメモリだけを保って回路を止める）
}

}  // namespace screen
