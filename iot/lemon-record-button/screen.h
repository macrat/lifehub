#pragma once

#include <stdint.h>

// 液晶（GC9107）とバックライト（LP5562）。使わない間は両方とも止めておく。
namespace screen {

// アプリのレモンの画面と同じアイコン（icons.h）
enum class Icon : uint8_t {
  Mist,   // 葉水（葉）
  Water,  // 葉水＋水やり（しずく）
};

// 起動時に 1 度だけ。M5.begin() の後に呼び、画面を消した状態にする
void begin();

// 画面を点けてアイコンを出す
void show(Icon icon);

// 送れなかったことを示す（アイコンを灰色にして赤い × を重ねる）
void showFailed(Icon icon);

// 画面とバックライトを止める
void off();

}  // namespace screen
