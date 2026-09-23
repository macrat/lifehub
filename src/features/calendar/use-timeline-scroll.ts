import { useEffect, useLayoutEffect, useRef } from 'react';
import { pxAtMinute } from './use-hour-zoom.ts';

/** 縦位置を合わせるとき、狙った時刻の上に残す余白（px）。その前後の予定も一緒に見えるように */
const LEAD_IN = 120;
/** 最初に出したとき、今日を含まない日で見せる時刻（分） */
const DEFAULT_MINUTES = 7 * 60;
/** 予定が画面に収まりきらないとき、一番早い予定の上に残す時間（分） */
const FIT_LEAD_MINUTES = 60;

/**
 * 時間軸（`TimeGrid`）の縦のスクロール位置。返す ref を縦にスクロールする要素に付ける。
 * - 最初に出したときだけ合わせる。日付を移っても保つので、スワイプの前後でも見ていた時間帯がそのまま残る
 *   - 予定に合わせるとき（`itemsSpan`）は、一番早い予定から一番遅い予定までが収まるなら画面の真ん中に、
 *     収まらないなら一番早い予定の 1 時間前を一番上にする（早い予定から順に読み下ろせるように）
 *   - それ以外は、今日を含むなら現在時刻の少し上、含まないなら 7 時
 * - 伸び縮みしたら、画面の真ん中に見えていた時刻をそのままの位置に残す
 * - 見えない所に下書きの枠が置かれたら（追加ボタンから来たとき、シートに隠れる時間帯をなぞったとき）、
 *   その枠が見える所まで送る
 * 縦位置は 0 時からの分と 1 時間の高さから数で求める。下に足した余白（`bottomInset`）を含む
 * 実測（scrollHeight）は使えない。
 */
export function useTimelineScroll({
  nowMinutes,
  itemsSpan,
  hourHeight,
  draftStart,
  settled,
  bottomInset,
}: {
  /** 表示する日に今日が含まれるなら今の時刻（分）、含まれなければ null */
  nowMinutes: number | null;
  /** 最初になるべく全部見せたい予定の時間帯（分）。予定に合わせないとき・予定が無いときは null */
  itemsSpan: { startMin: number; endMin: number } | null;
  hourHeight: number;
  /** 時間軸に出している枠の開始（分）。出していなければ null */
  draftStart: number | null;
  /** 枠を置き終えた（指を離した）か */
  settled: boolean;
  /** シートが下から覆っている高さ（px）。見えている下端がその分だけ上がる */
  bottomInset: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const topOf = (min: number) => pxAtMinute(min, hourHeight);

  // 合わせるのは描画前（0 時からスクロールする様子を見せない。表示を切り替えたときは、
  // View Transition が新しい位置を測るより先にここで合わせておく）
  // biome-ignore lint/correctness/useExhaustiveDependencies: 最初に出したときだけ合わせる
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = Math.max(0, initialTop(el.clientHeight - bottomInset));
  }, []);

  function initialTop(visibleHeight: number) {
    if (itemsSpan) {
      const top = topOf(itemsSpan.startMin);
      const bottom = topOf(itemsSpan.endMin);
      return bottom - top > visibleHeight
        ? topOf(itemsSpan.startMin - FIT_LEAD_MINUTES)
        : (top + bottom - visibleHeight) / 2;
    }
    return nowMinutes !== null ? topOf(nowMinutes) - LEAD_IN : topOf(DEFAULT_MINUTES);
  }

  // 伸び縮みしたら、画面の真ん中に見えていた時刻をそのままの位置に残す（描画前に合わせて、
  // 伸びた時間軸が一瞬ずれて見えないようにする）。上端を固定すると、拡げるたびに
  // 見ていた時間帯が下へ流れていく。3 面とも同じ高さで同じだけ動くので、縦位置は揃ったままになる
  const drawn = useRef(hourHeight);
  useLayoutEffect(() => {
    const el = ref.current;
    const previous = drawn.current;
    drawn.current = hourHeight;
    if (!el || previous === hourHeight) return;
    const middle = el.scrollTop + el.clientHeight / 2;
    el.scrollTop = (middle * hourHeight) / previous - el.clientHeight / 2;
  }, [hourHeight]);

  // 見えない所に枠が置かれたら見える所まで送る。見えている下端はシートに覆われた分だけ上がる。
  // 始まりが見えているなら動かさない。なぞっている最中（settled が false）も動かさない:
  // どちらも、指の下でグリッドが動くと狙いがずれるため
  // biome-ignore lint/correctness/useExhaustiveDependencies: 送るのは枠かシートが動いたときだけ（伸び縮みは真ん中を保つ上の合わせ方に任せる）
  useEffect(() => {
    const el = ref.current;
    if (!el || draftStart === null || !settled) return;
    const top = topOf(draftStart);
    if (top >= el.scrollTop && top <= el.scrollTop + el.clientHeight - bottomInset - hourHeight)
      return;
    el.scrollTo({ top: Math.max(0, top - LEAD_IN), behavior: 'smooth' });
  }, [draftStart, settled, bottomInset]);

  return ref;
}
