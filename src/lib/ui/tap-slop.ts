/**
 * タップとなぞりの境目（px）。指を下ろしてからこれより動いたら、押したのではなく動かしたとみなす。
 * 長押し（`useRecordPress`、カレンダーの範囲選び）、シートのドラッグ（`useSheetDrag`）、
 * 引っ張って更新の向き（`usePullToRefresh`）が同じ値を使う。
 * WHY 1 つ: 同じ指の動きが、ある所では押したことになり、別の所ではなぞったことになると、触った手応えが揃わない。
 */
export const TAP_SLOP = 8;

/** 押した所 from から、今の指の位置（clientX・clientY）がどちらかの向きに TAP_SLOP を越えて動いたか */
export function movedPastSlop(
  from: { x: number; y: number },
  to: { clientX: number; clientY: number },
): boolean {
  return Math.abs(to.clientX - from.x) > TAP_SLOP || Math.abs(to.clientY - from.y) > TAP_SLOP;
}
