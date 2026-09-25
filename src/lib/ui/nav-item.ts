import type { LinkProps } from '@tanstack/react-router';
import type { ComponentType } from 'react';

/** ナビ（スマホの下部ナビ・PC のサイドナビ）の項目 */
export type NavItem = {
  label: string;
  to: LinkProps['to'];
  icon: ComponentType;
  /**
   * その画面を見ているときにもう一度押したときの動き。どちらか 1 つだけ選べる:
   * - `{ search }`: その検索パラメータ（今の物から作る）で開き直す
   * - `'initialPosition'`: 画面の最初の位置までなめらかにスクロールする（`scrollToInitialPosition`）。
   *   最初の位置を画面自身が決めるルート（`staticData.ownsScroll`）に使う
   * 無いときは検索パラメータを付けずに開き直す（その画面の既定）。ほかの画面から来たときは使わない
   */
  reselect?: { search: LinkProps['search'] } | 'initialPosition';
  /** true なら PC のサイドナビにだけ出す（スマホの下部ナビには出さず、ホームの末尾から開く） */
  desktopOnly?: boolean;
};
