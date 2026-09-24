#include "screen.h"

#include <M5Unified.h>
#include <math.h>

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

constexpr int SIZE = 128;
constexpr int CENTER = SIZE / 2;

constexpr uint16_t LEAF_COLOR = 0x3E68;      // #3BCD44 付近の緑
constexpr uint16_t LEAF_VEIN_COLOR = 0x1B83;  // 濃い緑
constexpr uint16_t DROP_COLOR = 0x2D7F;      // #2BAFFF 付近の青
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

// 葉: 2 つの円が重なるレンズ形を、左下から右上へ向けて斜めに置く。
// レンズは凸なので、1 行ごとに内側の左端と右端を探して横線で塗る。
void drawLeaf(bool failed) {
  const uint16_t color = failed ? FAILED_COLOR : LEAF_COLOR;
  constexpr float R = 70.0f;  // 円の半径
  constexpr float D = 48.0f;  // 軸から円の中心までの距離（大きいほど細く、先が尖る）
  const float k = 1.0f / sqrtf(2.0f);
  auto inside = [&](int x, int y) {
    const float dx = x - CENTER, dy = y - CENTER;
    const float u = (dx - dy) * k;  // 葉の軸方向（右上が正）
    const float v = (dx + dy) * k;  // 軸と直交する方向
    return (v - D) * (v - D) + u * u <= R * R && (v + D) * (v + D) + u * u <= R * R;
  };
  for (int y = 0; y < SIZE; ++y) {
    int left = -1, right = -1;
    for (int x = 0; x < SIZE; ++x) {
      if (!inside(x, y)) continue;
      if (left < 0) left = x;
      right = x;
    }
    if (left >= 0) M5.Display.drawFastHLine(left, y, right - left + 1, color);
  }
  // 葉脈と葉柄: 軸に沿った線を、左下の先端から少し外へ伸ばす
  const int half = static_cast<int>(sqrtf(R * R - D * D) * k);
  M5.Display.drawWideLine(CENTER - half - 10, CENTER + half + 10, CENTER + half - 8,
                          CENTER - half + 8, 3, failed ? FAILED_COLOR : LEAF_VEIN_COLOR);
}

// 水滴: 円と、その円に接する三角（上の尖り）
void drawDrop(bool failed) {
  const uint16_t color = failed ? FAILED_COLOR : DROP_COLOR;
  constexpr int CY = 78, R = 34, TOP = 12;
  const float d = CY - TOP;
  const float a = acosf(R / d);  // 真上から接点までの角度
  const int tx = static_cast<int>(R * sinf(a));
  const int ty = CY - static_cast<int>(R * cosf(a));
  M5.Display.fillCircle(CENTER, CY, R, color);
  M5.Display.fillTriangle(CENTER, TOP, CENTER - tx, ty, CENTER + tx, ty, color);
  // 光の照り返し
  if (!failed) M5.Display.fillCircle(CENTER - 13, CY + 4, 7, TFT_WHITE);
}

void drawIcon(screen::Icon icon, bool failed) {
  M5.Display.startWrite();
  M5.Display.fillScreen(TFT_BLACK);
  if (icon == screen::Icon::Leaf) {
    drawLeaf(failed);
  } else {
    drawDrop(failed);
  }
  M5.Display.endWrite();
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
