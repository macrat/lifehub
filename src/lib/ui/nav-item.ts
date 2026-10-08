import type { LinkProps } from '@tanstack/react-router';
import type { ComponentType } from 'react';

/** ナビ（スマホの下部ナビ・PC のサイドナビ）の項目 */
export type NavItem = {
  label: string;
  to: LinkProps['to'];
  icon: ComponentType;
  /**
   * その画面を見ているときにもう一度押したときの検索パラメータ（今の物から作る）。ほかの画面から来たときは
   * 付けない（その画面の既定で開く）。無ければ、もう一度押すと画面の最初の位置までなめらかに戻る
   * （`scrollToInitialPosition`）
   */
  reselectSearch?: LinkProps['search'];
  /** true なら PC のサイドナビにだけ出す（スマホの下部ナビには出さず、ホームの AppBar の歯車から開く） */
  desktopOnly?: boolean;
};
