import type { SxProps, Theme } from '@mui/material/styles';

/** 段から段へ滑る時間（ms）。高さが変わるときの伸び縮み（`useSheetSize`）も同じ速さにする */
export const SLIDE_MS = 250;

type SheetStyle = {
  /** 画面いっぱいの高さにするか。しなければ中身の高さのまま */
  fullHeight: boolean;
  /** translateY（px）。測る前は null で、画面の外に置く（高さが分かってから止まる段まで滑り込ませる） */
  position: number | null;
  /** 指に追従している最中か（その間は滑らせない） */
  dragging: boolean;
  /** 出しているか。下げた間は読み上げにも残さない */
  open: boolean;
};

/** 画面の下から出るシート（`BottomSheet`）の見た目と位置 */
export function sheetSx({ fullHeight, position, dragging, open }: SheetStyle): SxProps<Theme> {
  return {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    height: fullHeight ? '100dvh' : 'auto',
    maxHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: '16px 16px 0 0',
    // 焦点を受け取るのは中身の入力欄なので、シート自身の焦点の枠は出さない（MUI の Dialog と同じ）
    outline: 'none',
    // 画面いっぱいになるので、AppBar や下部ナビより前に出す
    zIndex: (t) => t.zIndex.modal,
    // なぞりはすべて自分で扱う（中のスクロールする所も含む。useSheetDrag で動かす）。
    // touch-action はスクロールする所で打ち切られるので、中身にも行き渡らせる
    touchAction: 'none',
    '& *': { touchAction: 'none' },
    transform: position === null ? 'translateY(100%)' : `translateY(${position}px)`,
    // 下がりきるまでは見せたいので、隠す切り替えだけ遅らせる
    visibility: open ? 'visible' : 'hidden',
    transition: dragging
      ? 'none'
      : `transform ${SLIDE_MS}ms ease, visibility 0s ${open ? 0 : SLIDE_MS}ms`,
  };
}
