/**
 * グリッドの要素に付ける印と、それを DOM から探すセレクタ。付ける部品と探す側（フック・別の部品）が
 * 同じ値を読むよう、部品のファイルではなくここに置く。
 */

/**
 * 下書きの枠の印。時間軸のブロックにも月・終日欄の帯にも同じものを付ける。
 * 枠の位置を DOM から引く側（見える所まで送る・吹き出しを寄せる）はこれで探す。
 */
export const draftProps = { 'data-draft': '' };
export const DRAFT_SELECTOR = '[data-draft]';

/** 面の中で縦にスクロールする部分（時間軸・月グリッド）の印。スワイプの 3 面で縦位置を揃えるのに使う */
export const syncScrollProps = { 'data-sync-scroll': '' };
export const SYNC_SCROLL_SELECTOR = '[data-sync-scroll]';
