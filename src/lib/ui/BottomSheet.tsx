import Box from '@mui/material/Box';
import Modal from '@mui/material/Modal';
import Paper from '@mui/material/Paper';
import type { ReactNode, RefObject } from 'react';
import { sheetSx } from './sheet-style.ts';
import { type SheetDetent, useBottomSheet } from './use-bottom-sheet.ts';

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
  /**
   * 後ろの画面を下から覆っている高さ（px）が変わったとき。消えるときは 0 を渡す。
   * 下の段では後ろをそのまま触れるので、覆われた分だけ後ろが自分で余白を作れるようにする。
   */
  onChangeInset?: (inset: number) => void;
  label?: never;
  full?: never;
  onExpand?: never;
};

/**
 * 段を持たないシート（入力フォーム）。中身の高さのまま画面の下に出すので、
 * 中身が短ければ入力欄も操作も画面の下（指の届くところ）に集まる。後ろは暗くして触れなくする。
 */
type Plain = {
  peekRef?: never;
  detent?: never;
  onChangeDetent?: never;
  onChangeInset?: never;
  /** ダイアログとしての名前（読み上げ用）。見出しと同じ文言を渡す */
  label: string;
  /** 中身の高さではなく画面いっぱいで出す（項目が多くて結局画面を覆うフォーム） */
  full?: boolean;
  /**
   * 上へスワイプしたとき。段を持たないシートに「次の段」を決められるのは中身だけなので、
   * 広げるかどうかは呼び出し側に任せる（詳細なら編集に移る = 鉛筆と同じ）。
   * 渡さなければ上へは何も起きない。
   */
  onExpand?: () => void;
};

type Props = {
  /** 出しているか。false のあいだは画面の外に下げる（送信中など。閉じたのとは違うので onClose は呼ばない） */
  open?: boolean;
  /** 下の段からさらに下げたとき。下がりきってから呼ぶ */
  onClose: () => void;
  children: ReactNode;
} & (Stepped | Plain);

/**
 * 画面の下から出るシート。下へ下げきると閉じる（Google カレンダー方式）。
 * 指に追従して動き（`useSheetDrag`）、離すと動かした向きへ 1 段ぶん進んで止まる。
 * `peekRef` を渡すと上・下の 2 段で止まり、下の段からさらに下げたときだけ閉じる。
 * 段を持たないシートでは、上へのスワイプは `onExpand` に渡す（中身を広げるのは呼び出し側の仕事）。
 *
 * 高さは `translateY` で見える量を変える。段の位置は中身の実測（`useSheetSize`）から決める。
 * 開いている間は履歴に項目を 1 つ持ち（`useDialogHistory`）、戻る操作では前の画面へ行かずシートだけを閉じる。
 * 状態と操作は `useBottomSheet` が持ち、ここは描くだけ。
 */
export function BottomSheet({
  open = true,
  onClose,
  peekRef,
  detent,
  onChangeDetent,
  onChangeInset,
  label,
  full = false,
  onExpand,
  children,
}: Props) {
  const { setSheet, drag, dismiss } = useBottomSheet({
    open,
    onClose,
    peekRef,
    detent,
    onChangeDetent,
    onChangeInset,
    onExpand,
  });

  const paper = (
    <Paper
      ref={setSheet}
      elevation={8}
      data-sheet
      // 段を持たないシートはモーダル。Modal が焦点と Esc を見るので、役割だけを持たせる
      role={peekRef ? undefined : 'dialog'}
      aria-modal={peekRef ? undefined : true}
      aria-label={label}
      {...drag.handlers}
      sx={sheetSx({
        // 2 段のシートは上の段で後ろを覆いきるよう常に画面いっぱい。段が無ければ中身の高さのまま
        fullHeight: peekRef != null || full,
        position: drag.position,
        dragging: drag.dragging,
        open,
      })}
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
