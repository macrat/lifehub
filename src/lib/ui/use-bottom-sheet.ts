import type { RefObject } from 'react';
import { useEffect, useState } from 'react';
import { useDialogHistory } from './dialog-history.ts';
import { SLIDE_MS } from './sheet-style.ts';
import { useSheetDrag } from './use-sheet-drag.ts';
import { useSheetSize } from './use-sheet-size.ts';
import { useTimeout } from './use-timeout.ts';

/** 止まる段。閉じる段（画面の外）は状態には持たず、下げきったら onClose で消える */
export type SheetDetent = 'full' | 'peek';

/** 段を 1 つ動かすのに要るドラッグ（px）。これに満たなければ元の段に戻す */
const STEP_DISTANCE = 40;

/**
 * 下から出るシート（`BottomSheet`）の状態と操作: 止まる位置（中身の実測 `useSheetSize` から決める）、
 * 指への追従（`useSheetDrag`）、離したときに 1 段進める・下げきったら閉じる、後ろを覆う高さの知らせ、
 * 開いている間の履歴の項目（`useDialogHistory`。戻る操作では前の画面へ行かずシートだけを閉じる）。
 * シートの要素は返す setSheet で受け取る。
 */
export function useBottomSheet({
  open,
  onClose,
  peekRef,
  detent,
  onChangeDetent,
  onChangeInset,
  onExpand,
}: {
  open: boolean;
  onClose: () => void;
  peekRef: RefObject<HTMLElement | null> | undefined;
  detent: SheetDetent | undefined;
  onChangeDetent: ((detent: SheetDetent) => void) | undefined;
  onChangeInset: ((inset: number) => void) | undefined;
  onExpand: (() => void) | undefined;
}) {
  useDialogHistory(onClose);
  const [sheet, setSheet] = useState<HTMLElement | null>(null);
  const size = useSheetSize(sheet, peekRef);
  const [closing, setClosing] = useState(false);
  const later = useTimeout();

  /** 段ごとの translateY（px）。上の段が 0 で、下へ行くほど大きい */
  const offsets = { full: 0, peek: Math.max(size.sheet - size.peek, 0), closed: size.sheet };
  const measured = size.sheet > 0 && (!peekRef || size.peek > 0);
  const resting = closing || !open || !measured ? offsets.closed : offsets[detent ?? 'full'];

  // 後ろに余白を作らせる高さ。止まる段（`resting`）から決めるので、下げているとき・測る前は
  // ひとりでに 0 になる。上の段では後ろを覆いきるので、余白を作らせても見えないぶん 0 にする。
  // 指で動かしている間は変えない（後ろを毎フレーム組み直さない。離せばどちらかの段に収まる）
  const inset = detent === 'peek' ? size.sheet - resting : 0;
  useEffect(() => {
    onChangeInset?.(inset);
  }, [onChangeInset, inset]);
  // 消えたら覆っていない。知らせるのはここだけにする（値が変わるたびに 0 を挟まない）
  useEffect(() => () => onChangeInset?.(0), [onChangeInset]);

  /** 下がりきるのを見せてから消す（transitionend は中身の要素の分も来るので時間で待つ） */
  const dismiss = () => {
    setClosing(true);
    later(onClose, SLIDE_MS);
  };

  /** 離したとき、動かした向きへ 1 段進める。上は広げる、下は下の段へ、下の段からは閉じる */
  const step = (moved: number) => {
    if (Math.abs(moved) < STEP_DISTANCE) return;
    if (moved < 0) {
      onChangeDetent?.('full');
      onExpand?.();
    } else if (detent === 'full') onChangeDetent?.('peek');
    else dismiss();
  };

  const drag = useSheetDrag({
    enabled: measured,
    resting,
    max: offsets.closed,
    onRelease: step,
  });

  return { setSheet, drag, dismiss };
}
