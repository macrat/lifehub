/**
 * 押せる範囲（ボタン）の中に、別に押せるもの（リンク・チェックボックス）を置くための組み方。
 * ボタンの中にはボタンもリンクも入れ子にできない（押したときにどちらが動くかがブラウザ任せになり、
 * 読み上げでも 1 つのボタンとして読まれる）ので、中身の無いボタンを枠いっぱいに敷き（UNDERLAY_BUTTON_SX）、
 * その上に中身を重ねる（OVERLAY_CONTENT_SX）。中身は押せなくして下のボタンに通し、
 * 中身の中の押せるものだけは押せるようにする。ボタンの名前は aria-label か aria-labelledby で付ける。
 * 枠（両方の親）には position を持たせる。
 */

/** 枠いっぱいに敷くボタン */
export const UNDERLAY_BUTTON_SX = { position: 'absolute', inset: 0 } as const;

/**
 * ボタンの上に重ねる中身。position を持たせて下のボタンより手前に描く。
 * MUI の Checkbox・Switch は透明な input を印いっぱいに重ねているので、input で拾える
 */
export const OVERLAY_CONTENT_SX = {
  position: 'relative',
  pointerEvents: 'none',
  '& :is(a[href], button, input, select, textarea)': { pointerEvents: 'auto' },
} as const;
