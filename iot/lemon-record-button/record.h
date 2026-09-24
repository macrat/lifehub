#pragma once

// LifeHub の記録投入用エンドポイント（POST /api/records）に、レモンの世話を 1 件送る。
namespace record {

enum class Care {
  Mist,          // 葉水
  MistAndWater,  // 葉水＋水やり
};

// Wi-Fi に繋いで送り、切断して無線を止めるまでを行う。記録できたら true
bool send(Care care);

}  // namespace record
