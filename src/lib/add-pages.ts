/**
 * 入力を開いて始めるしるし（URL の `add`）を受ける画面と、それぞれが開ける種類。
 * 画面の検索パラメータ（`addSearchSchema`）も PWA のショートカット（`shortcuts.ts` の `addUrl`）も
 * この表から作るので、画面が受け取れない種類をショートカットの URL に書くと型で止まる。
 * 種類を選ぶ追加ボタン（`AddMenu`）もこの並びで出す（下から順なので、先頭の種類がボタンのすぐ上に来る）。
 * 読むのはアプリとビルド時（manifest とアイコンの生成）なので、React にも zod にも依存させない。
 */
export const ADD_PAGES = {
  '/': ['memo'],
  '/calendar': ['event', 'task'],
  '/expenses': ['expense'],
  '/lemon': ['lemon'],
} as const;

export type AddPage = keyof typeof ADD_PAGES;

/** その画面で開ける種類 */
type AddKindOf<P extends AddPage> = (typeof ADD_PAGES)[P][number];

/** 追加できる種類（名前とアイコンは `add-kinds.ts`） */
export type AddKind = AddKindOf<AddPage>;

/** その画面で種類 kind の入力を開いて始める URL */
export function addUrl<P extends AddPage, K extends AddKindOf<P>>(
  page: P,
  kind: K,
): `${P}?add=${K}` {
  return `${page}?add=${kind}`;
}
