import GlobalStyles from '@mui/material/GlobalStyles';

/**
 * この画面では引っ張って更新（Android）を出さない。
 *
 * 引っ張って更新は既定では残してある。一覧やカレンダーでは「最新にしたい」に素直に応える動きだからで、
 * 止めるのは、その意味が無いうえに操作を壊す画面だけにする。設定は上端に指で動かす操作（色のスライダー）が
 * 並ぶ画面、ユーザー管理は入力の途中でシートが開いている画面なので、上端からの下向きの動きが
 * 再読み込みに化けるとやりかけが消える。どちらも引いて取り直したい内容を持たない。
 *
 * 効かせる先は `html`（ブラウザはページ全体のスクロールの設定をここから読む）。画面の側から
 * `html` を狙う手段は `sx` には無いので、MUI が同じ用途に用意している `GlobalStyles` を使う。
 * 出している間だけ効き、画面を移れば自分で消えるので、後片付けを書かなくて済む。
 */
export function NoPullToRefresh() {
  return <GlobalStyles styles={{ html: { overscrollBehaviorY: 'contain' } }} />;
}
