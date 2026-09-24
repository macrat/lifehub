#pragma once

// LifeHub の記録投入用エンドポイント（POST /api/records）に、レモンの世話を 1 件送る。
namespace record {

enum class Care {
  Mist,          // 葉水
  MistAndWater,  // 葉水＋水やり
};

// Wi-Fi への接続を始める（待たない）。押し終わりを待っている間に繋ぎ始めて、起きている時間を縮める
void connect();

// 接続を待って送り、切断して無線を止める。記録できたら true
bool send(Care care);

// 送らずに無線を止める（連打で取り消したとき）
void cancel();

}  // namespace record
