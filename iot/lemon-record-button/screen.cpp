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

// 本体を横向き（右に 90 度倒して）置くので、描くものを左に 90 度回す。
// setRotation は 1 増やすごとに時計回りに 90 度回るので、3 増やす（= 左に 90 度）。
// 既定の向きからの相対にするのは、M5GFX がボードごとに決める既定の向きに左右されないようにするため
constexpr uint8_t ROTATE_LEFT = 3;

// 送れなかったときはアイコンを灰色にして、赤い × を重ねる。
// × は画面の中央に、縁から 3/16 ずつ空けて置く（アイコンの絵とおおむね同じ広さになる）
constexpr uint16_t FAILED_COLOR = TFT_DARKGREY;
constexpr int CROSS_NEAR = icons::SIZE * 3 / 16;
constexpr int CROSS_FAR = icons::SIZE - CROSS_NEAR;
constexpr float CROSS_WIDTH = icons::SIZE / 16.0f;

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
  const uint8_t* image = icon == screen::Icon::Mist ? icons::MIST : icons::WATER;
  M5.Display.pushGrayscaleImage(0, 0, icons::SIZE, icons::SIZE, image, lgfx::grayscale_4bit,
                                failed ? FAILED_COLOR : TFT_WHITE, TFT_BLACK);
}

}  // namespace

namespace screen {

void begin() {
  M5.Display.setRotation((M5.Display.getRotation() + ROTATE_LEFT) % 4);
  off();
}

void show(Icon icon) {
  M5.Display.wakeup();
  drawIcon(icon, false);
  backlight(true);
}

void showFailed(Icon icon) {
  drawIcon(icon, true);
  M5.Display.drawWideLine(CROSS_NEAR, CROSS_NEAR, CROSS_FAR, CROSS_FAR, CROSS_WIDTH, TFT_RED);
  M5.Display.drawWideLine(CROSS_FAR, CROSS_NEAR, CROSS_NEAR, CROSS_FAR, CROSS_WIDTH, TFT_RED);
}

void off() {
  backlight(false);
  M5.Display.sleep();  // パネルを SLEEP IN にする（表示用のメモリだけを保って回路を止める）
}

}  // namespace screen
