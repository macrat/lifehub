import { type PointerEvent, useEffect, useRef, useState } from 'react';
import type { DateString } from '../../../shared/types.ts';
import { MIN_BLOCK_MINUTES } from './components/timeline-layout.ts';

/** 選んだ時間帯（その日の 0:00 からの分。終わりは排他的） */
export type TimeSelection = { date: DateString; startMin: number; endMin: number };

/** ドラッグの刻み（分）。Google カレンダーと同じ 15 分の枠に吸着させる */
const STEP_MINUTES = 15;
const SLOTS_PER_DAY = (24 * 60) / STEP_MINUTES;
/** タッチで選択を始めるまでの長押し（ms）。タップや縦スクロールを選択と取り違えないための区切り */
const LONG_PRESS_MS = 300;
/** 長押しを待つ間に許す指のぶれ（px）。これを超えて動いたらスクロールのつもりとみなしてやめる */
const LONG_PRESS_SLOP = 8;

/**
 * 時間軸の上端からの px 2 点 → 15 分刻みの時間帯。
 * 触れた枠はすべて含め（上向きのドラッグも同じ）、読めない高さにならないよう最短 MIN_BLOCK_MINUTES を保つ。
 */
export function dragRange(
  anchorY: number,
  currentY: number,
  hourHeight: number,
): { startMin: number; endMin: number } {
  const slotHeight = (hourHeight * STEP_MINUTES) / 60;
  const slotAt = (y: number) =>
    Math.min(Math.max(Math.floor(y / slotHeight), 0), SLOTS_PER_DAY - 1);
  const anchorSlot = slotAt(anchorY);
  const currentSlot = slotAt(currentY);
  const startMin = Math.min(
    Math.min(anchorSlot, currentSlot) * STEP_MINUTES,
    24 * 60 - MIN_BLOCK_MINUTES,
  );
  const endMin = (Math.max(anchorSlot, currentSlot) + 1) * STEP_MINUTES;
  return { startMin, endMin: Math.max(endMin, startMin + MIN_BLOCK_MINUTES) };
}

type Drag = {
  pointerId: number;
  date: DateString;
  /** 列の上端の clientY（px → 分の基準） */
  top: number;
  /** ドラッグを始めた位置（列の上端からの px） */
  anchorY: number;
  /** 長押しを待っている間は false */
  active: boolean;
};

/**
 * 時間軸を縦にドラッグして時間帯を選ぶ（Google カレンダーと同じ操作）。
 * マウス・ペンは押した時点から、タッチは長押しから始める（タップや縦スクロール・横スワイプと分ける）。
 * ドラッグ中の時間帯は state として返すだけで描画は呼び出し側に任せ、離した時点の時間帯を onSelect に渡す。
 * 動かさずに離したときは最短の時間帯を選んだものとして扱う。
 */
export function useTimeDrag({
  hourHeight,
  onSelect,
}: {
  hourHeight: number;
  onSelect: (selection: TimeSelection) => void;
}) {
  const [selection, setSelection] = useState<TimeSelection | null>(null);
  const drag = useRef<Drag | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    drag.current = null;
    setSelection(null);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const dragging = selection !== null;
  useEffect(() => {
    if (!dragging) return;
    // ドラッグ中のタッチは選択にだけ使う。capture で先に受けて、縦スクロールと横スワイプ（use-swipe）に渡さない
    const block = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('touchmove', block, { capture: true, passive: false });
    return () => document.removeEventListener('touchmove', block, { capture: true });
  }, [dragging]);

  return {
    /** ドラッグ中の時間帯（描画用）。ドラッグしていなければ null */
    selection,
    /** 日の列に渡す props。列の空いている所を押したときだけ始まる（項目の上では項目の操作を邪魔しない） */
    props: (date: DateString) => ({
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (e.button !== 0 || e.target !== e.currentTarget) return;
        const el = e.currentTarget;
        const { pointerId, clientY } = e;
        const top = el.getBoundingClientRect().top;
        const anchorY = clientY - top;
        const begin = () => {
          if (!drag.current) return;
          drag.current.active = true;
          // 列の外に出ても離すまで同じ列を追いかける（週表示で隣の日に移らない）
          el.setPointerCapture(pointerId);
          setSelection({ date, ...dragRange(anchorY, anchorY, hourHeight) });
        };
        drag.current = { pointerId, date, top, anchorY, active: false };
        if (e.pointerType === 'touch') timer.current = setTimeout(begin, LONG_PRESS_MS);
        else begin();
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        const d = drag.current;
        if (!d || d.pointerId !== e.pointerId) return;
        const y = e.clientY - d.top;
        if (!d.active) {
          if (Math.abs(y - d.anchorY) > LONG_PRESS_SLOP) reset();
          return;
        }
        setSelection({ date: d.date, ...dragRange(d.anchorY, y, hourHeight) });
      },
      onPointerUp: (e: PointerEvent<HTMLElement>) => {
        const d = drag.current;
        if (!d || d.pointerId !== e.pointerId) return;
        if (d.active) {
          onSelect({ date: d.date, ...dragRange(d.anchorY, e.clientY - d.top, hourHeight) });
        }
        reset();
      },
      onPointerCancel: reset,
    }),
  };
}
