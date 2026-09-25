/**
 * 文字に View Transition の名前を付ける sx（名前が無ければ何も付けない）。
 * 動く絵は要素の箱の幅で撮られ、縦横比を保ったまま相手の幅へ伸縮されるので、文字の幅に縮めておく
 * （行の幅のままだと、行の幅の違う相手との間で文字ごと引き伸ばされる）。
 */
export const textTransitionSx = (name: string | undefined) =>
  name === undefined ? {} : { width: 'fit-content', viewTransitionName: name };
