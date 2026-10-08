import { type PointerEvent, useEffect, useRef } from 'react';
import { TAP_SLOP } from './tap-slop.ts';

/** タッチで長押しと認めるまでの時間（ms）。タップや縦スクロールと取り違えないための区切り */
export const LONG_PRESS_MS = 300;

/** 記録 1 件を出す行・タイルに渡すハンドラ */
type RecordPressHandlers = {
  onClick: () => void;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
};

/**
 * 記録 1 件を出す行の押し分け。**単押しは閲覧、長押しは編集**で、アプリのどの画面でも同じ。
 * 閲覧と編集は同じシート（`RecordSheet`）の 2 つの顔なので、押した指の長さがそのまま
 * どちらの顔で開くかになる（`onSelect` の editing）。長押しは読むだけの段を飛ばす近道で、
 * タップで開いてから鉛筆や上へのスワイプで編集に移る道も残る。
 *
 * 長押しを見るのはタッチのときだけ。マウス・ペンでは押しっぱなしに意味を持たせず、
 * 開いた詳細の鉛筆から編集に入る（長押しは指の作法で、そこには鉛筆という近くて確かな入口がある）。
 * 待っている間に指が `TAP_SLOP` より動いたら一覧をスクロールするつもりとみなしてやめる。
 *
 * 長押ししても文字は選ばれずメニューも出ない（`user-select` と `-webkit-touch-callout` を
 * `src/lib/theme.ts` で 1 か所止めてある）ので、ここで既定の動きを打ち消すことはしない。
 */
export function useRecordPress(onSelect: (editing: boolean) => void): RecordPressHandlers {
  /** 長押しを待っている指（押し始めた所と待ち）。待っていなければ null */
  const press = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  /** 長押しの後に来る click を飲む仕掛けの後始末。仕掛けていなければ null */
  const swallow = useRef<AbortController | null>(null);

  const cancel = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };

  /**
   * 長押しで開いた後、指を離したときに来る click を 1 回だけ飲む。
   * タッチの click は指を離した所にあるものへ向かうので、飲まないと長押しで出てきたもの
   * （開いたシート、その後ろの覆い）が押される。覆いなら開いた途端に閉じ、シートなら
   * 中のボタンが押される。指の下に何が来るかは開くものによるので、飲むのは押した側の仕事にする。
   * 文書全体で捕まえ、React が受け取るより前に止める。
   * 次に押し始めたときにも外す。指を動かしてから離すと click が来ないことがあり、
   * 仕掛けたままだと関係のない次のタップを飲んでしまう（押下は必ず click より先に来る）。
   */
  const swallowNextClick = () => {
    const controller = new AbortController();
    swallow.current = controller;
    const options = { capture: true, signal: controller.signal };
    document.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        controller.abort();
      },
      options,
    );
    document.addEventListener('pointerdown', () => controller.abort(), options);
  };

  // 行が消えても長押しの待ちと click の仕掛けを残さない
  // biome-ignore lint/correctness/useExhaustiveDependencies: 見るのは ref だけで、どの描画でも同じ
  useEffect(
    () => () => {
      cancel();
      swallow.current?.abort();
    },
    [],
  );

  return {
    onClick: () => onSelect(false),
    onPointerDown: (event) => {
      if (event.pointerType !== 'touch') return;
      press.current = {
        x: event.clientX,
        y: event.clientY,
        timer: setTimeout(() => {
          cancel();
          swallowNextClick();
          onSelect(true);
        }, LONG_PRESS_MS),
      };
    },
    onPointerMove: (event) => {
      const from = press.current;
      if (!from) return;
      const far =
        Math.abs(event.clientX - from.x) > TAP_SLOP || Math.abs(event.clientY - from.y) > TAP_SLOP;
      if (far) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
  };
}
