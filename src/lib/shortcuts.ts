/**
 * PWA のショートカット（manifest の `shortcuts`）。ホーム画面のアイコンの長押し（Android）や
 * タスクバーの右クリック（PC）から、よく開く画面と入力へ直に入る。
 * ランチャーが出せる数には上限（多くは 4 件）があるので、よく使う順に並べる。
 *
 * manifest を書く `vite.config.ts` と、アイコンを生成する `scripts/generate-icons.ts` が
 * この一覧を読むので、足すのはここ 1 か所で済む。どちらもアプリの外（ビルド時）で動くため、
 * この module は React にも zod にも依存させない。
 */
export const SHORTCUTS = [
  { kind: 'calendar', name: 'カレンダー', shortName: 'カレンダー', url: '/calendar?view=month' },
  { kind: 'event', name: '予定登録', shortName: '予定', url: '/calendar?view=day&add=event' },
  { kind: 'task', name: 'タスク登録', shortName: 'タスク', url: '/calendar?add=task' },
  { kind: 'expense', name: '立替登録', shortName: '立替', url: '/expenses?add=expense' },
  { kind: 'lemon', name: 'レモンの記録', shortName: 'レモン', url: '/lemon?add=lemon' },
] as const;

/** ショートカットの種類。アイコンはこの名前で生成し、この名前で参照する */
export type ShortcutKind = (typeof SHORTCUTS)[number]['kind'];

/** アイコンの置き場所。生成するときの書き出し先は `public` の下の同じ道 */
export function shortcutIconSrc(kind: ShortcutKind): string {
  return `/icons/shortcut-${kind}-192.png`;
}
