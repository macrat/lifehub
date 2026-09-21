import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import { type PointerEvent, type ReactNode, type RefObject, useEffect, useState } from 'react';

/** 止まる段。閉じる段（画面の外）は状態には持たず、下げきったら onClose で消える */
export type SheetDetent = 'full' | 'peek';

type Props = {
  /** 出しているか。false のあいだは画面の外に下げる（送信中など。閉じたのとは違うので onClose は呼ばない） */
  open?: boolean;
  /** 今の段 */
  detent: SheetDetent;
  onChangeDetent: (detent: SheetDetent) => void;
  /** 下の段からさらに下げたとき。下がりきってから呼ぶ */
  onClose: () => void;
  /**
   * 下の段でも見えている部分の終わり。この要素の下端までが下の段で画面に残る。
   * 中身は呼び出し側が 1 つの `<form>` にまとめるので、境目だけを ref で受け取る。
   */
  peekRef: RefObject<HTMLElement | null>;
  children: ReactNode;
};

/** 段を 1 つ動かすのに要るドラッグ（px）。これに満たなければ元の段に戻す */
const STEP_DISTANCE = 40;
/** 段から段へ滑る時間（ms） */
const SLIDE_MS = 250;
/**
 * ドラッグを始めない要素。入力や押せるもの、自分でスクロールする所はそちらに任せる。
 * スクロールする所には `data-sheet-scroll` と `touch-action: pan-y` を付ける（シート側は none）。
 */
const CONTROLS = 'input, textarea, select, button, a, label, [role="button"], [data-sheet-scroll]';

/**
 * 画面の下から出るシート。上・下の 2 段で止まり、下の段からさらに下げると閉じる（Google カレンダー方式）。
 * 指に追従して動き、離すと動かした向きへ 1 段ぶん進んで止まる。
 * モーダルにしないので、下の段では後ろの画面をそのまま触れる。
 *
 * 高さは常に画面いっぱいで、`translateY` で見える量を変える。段の位置は中身の実測から決めるので、
 * 見出しの高さやキーボードの表示で画面が縮んでも自分で合わせ直す。
 */
export function BottomSheet({
  open = true,
  detent,
  onChangeDetent,
  onClose,
  peekRef,
  children,
}: Props) {
  const [sheet, setSheet] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState({ sheet: 0, peek: 0 });
  const [drag, setDrag] = useState<{
    pointerId: number;
    /** 押した指の位置と、そのときのシートの位置 */
    startY: number;
    origin: number;
    /** 今のシートの位置（指の動いたぶんだけ origin からずらす） */
    y: number;
  } | null>(null);
  /** 離した瞬間の位置。1 フレームだけ保ってから段へ滑らせる（同じ更新で transition を戻すと効かない） */
  const [released, setReleased] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (released === null) return;
    const frame = requestAnimationFrame(() => setReleased(null));
    return () => cancelAnimationFrame(frame);
  }, [released]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: peekRef は描画のたびに同じ入れ物
  useEffect(() => {
    const peek = peekRef.current;
    if (!sheet || !peek) return;
    const measure = () =>
      setSize({
        sheet: sheet.clientHeight,
        peek: peek.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top,
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    observer.observe(peek);
    return () => observer.disconnect();
  }, [sheet]);

  /** 段ごとの translateY（px）。測る前は画面の外に置き、測れた時点で下の段まで滑り込ませる */
  const offsets = { full: 0, peek: Math.max(size.sheet - size.peek, 0), closed: size.sheet };
  const measured = size.sheet > 0 && size.peek > 0;
  const resting = closing || !open || !measured ? offsets.closed : offsets[detent];

  const end = (event: PointerEvent<HTMLElement>) => {
    if (drag?.pointerId !== event.pointerId) return;
    const moved = event.clientY - drag.startY;
    setReleased(drag.y);
    setDrag(null);
    if (Math.abs(moved) < STEP_DISTANCE) return;
    if (moved < 0) onChangeDetent('full');
    else if (detent === 'full') onChangeDetent('peek');
    else {
      // 下がりきるのを見せてから消す（transitionend は中身の要素の分も来るので時間で待つ）
      setClosing(true);
      setTimeout(onClose, SLIDE_MS);
    }
  };

  // DEBUG
  console.log(
    '[sheet]',
    JSON.stringify({ drag: drag?.y ?? null, released, closing, resting, measured }),
  );

  return (
    <Paper
      ref={setSheet}
      elevation={8}
      data-sheet
      onPointerDown={(event) => {
        if (event.button !== 0 || !measured) return;
        if (event.target instanceof Element && event.target.closest(CONTROLS)) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag({ pointerId: event.pointerId, startY: event.clientY, origin: resting, y: resting });
      }}
      onPointerMove={(event) => {
        if (drag?.pointerId !== event.pointerId) return;
        const y = drag.origin + (event.clientY - drag.startY);
        setDrag({ ...drag, y: Math.min(Math.max(y, offsets.full), offsets.closed) });
      }}
      onPointerUp={end}
      onPointerCancel={end}
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        top: 0,
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '16px 16px 0 0',
        // 上の段では画面いっぱいになるので、AppBar や下部ナビより前に出す
        zIndex: (t) => t.zIndex.modal,
        touchAction: 'none',
        // 測る前は画面の外に置く（高さが分かってから下の段まで滑り込ませる）
        transform: measured
          ? `translateY(${drag?.y ?? released ?? resting}px)`
          : 'translateY(100%)',
        transition: drag ? 'none' : `transform ${SLIDE_MS}ms ease`,
      }}
    >
      {/* つまんで動かせることを示す横棒。帯のどこからでもドラッグできる */}
      <Box sx={{ py: 1, display: 'flex', justifyContent: 'center', cursor: 'grab' }}>
        <Box aria-hidden sx={{ width: 32, height: 4, borderRadius: 2, bgcolor: 'divider' }} />
      </Box>
      {children}
    </Paper>
  );
}
