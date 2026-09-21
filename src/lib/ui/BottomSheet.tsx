import Box from '@mui/material/Box';
import Modal from '@mui/material/Modal';
import Paper from '@mui/material/Paper';
import { type PointerEvent, type ReactNode, type RefObject, useEffect, useState } from 'react';

/** 止まる段。閉じる段（画面の外）は状態には持たず、下げきったら onClose で消える */
export type SheetDetent = 'full' | 'peek';

/**
 * 上・下の 2 段で止まるシート（カレンダーのクイック入力）。上の段では画面いっぱいになる。
 * 下の段では後ろの画面をそのまま触れるよう、モーダルにはしない。
 */
type Stepped = {
  /**
   * 下の段でも見えている部分の終わり。この要素の下端までが下の段で画面に残る。
   * 中身は呼び出し側が 1 つの `<form>` にまとめるので、境目だけを ref で受け取る。
   */
  peekRef: RefObject<HTMLElement | null>;
  /** 今の段 */
  detent: SheetDetent;
  onChangeDetent: (detent: SheetDetent) => void;
  label?: never;
};

/**
 * 段を持たないシート（入力フォーム）。中身の高さのまま画面の下に出すので、
 * 中身が短ければ入力欄も操作も画面の下（指の届くところ）に集まる。後ろは暗くして触れなくする。
 */
type Plain = {
  peekRef?: never;
  detent?: never;
  onChangeDetent?: never;
  /** ダイアログとしての名前（読み上げ用）。見出しと同じ文言を渡す */
  label: string;
};

type Props = {
  /** 出しているか。false のあいだは画面の外に下げる（送信中など。閉じたのとは違うので onClose は呼ばない） */
  open?: boolean;
  /** 下の段からさらに下げたとき。下がりきってから呼ぶ */
  onClose: () => void;
  children: ReactNode;
} & (Stepped | Plain);

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
 * 画面の下から出るシート。下へ下げきると閉じる（Google カレンダー方式）。
 * 指に追従して動き、離すと動かした向きへ 1 段ぶん進んで止まる。
 * `peekRef` を渡すと上・下の 2 段で止まり、下の段からさらに下げたときだけ閉じる。
 *
 * 高さは `translateY` で見える量を変える。段の位置は中身の実測から決めるので、
 * 見出しの高さやキーボードの表示で画面が縮んでも自分で合わせ直す。
 */
export function BottomSheet({
  open = true,
  onClose,
  peekRef,
  detent,
  onChangeDetent,
  label,
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
    const peek = peekRef?.current ?? null;
    if (!sheet) return;
    const measure = () =>
      setSize({
        sheet: sheet.clientHeight,
        peek: peek ? peek.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top : 0,
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    if (peek) observer.observe(peek);
    return () => observer.disconnect();
  }, [sheet]);

  /** 段ごとの translateY（px）。測る前は画面の外に置き、測れた時点で止まる段まで滑り込ませる */
  const offsets = { full: 0, peek: Math.max(size.sheet - size.peek, 0), closed: size.sheet };
  const measured = size.sheet > 0 && (!peekRef || size.peek > 0);
  const resting = closing || !open || !measured ? offsets.closed : offsets[detent ?? 'full'];

  /** 下がりきるのを見せてから消す（transitionend は中身の要素の分も来るので時間で待つ） */
  const dismiss = () => {
    setClosing(true);
    setTimeout(onClose, SLIDE_MS);
  };

  const end = (event: PointerEvent<HTMLElement>) => {
    if (drag?.pointerId !== event.pointerId) return;
    const moved = event.clientY - drag.startY;
    setReleased(drag.y);
    setDrag(null);
    if (Math.abs(moved) < STEP_DISTANCE) return;
    if (moved < 0) onChangeDetent?.('full');
    else if (detent === 'full') onChangeDetent?.('peek');
    else dismiss();
  };

  const paper = (
    <Paper
      ref={setSheet}
      elevation={8}
      data-sheet
      // 段を持たないシートはモーダル。Modal が焦点と Esc を見るので、役割だけを持たせる
      role={peekRef ? undefined : 'dialog'}
      aria-modal={peekRef ? undefined : true}
      aria-label={label}
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
        bottom: 0,
        // 2 段のシートは上の段で後ろを覆いきるよう常に画面いっぱい。段が無ければ中身の高さのまま
        height: peekRef ? '100dvh' : 'auto',
        maxHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '16px 16px 0 0',
        // 焦点を受け取るのは中身の入力欄なので、シート自身の焦点の枠は出さない（MUI の Dialog と同じ）
        outline: 'none',
        // 画面いっぱいになるので、AppBar や下部ナビより前に出す
        zIndex: (t) => t.zIndex.modal,
        touchAction: 'none',
        // 測る前は画面の外に置く（高さが分かってから止まる段まで滑り込ませる）
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

  if (peekRef) return paper;
  // 後ろを暗くして触れなくする。焦点の閉じ込め・Esc・背景のスクロール止めも Modal に任せる
  return (
    <Modal open onClose={dismiss}>
      {paper}
    </Modal>
  );
}
