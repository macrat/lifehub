/**
 * PWA のショートカット（manifest の `shortcuts`。[architecture.md](../../docs/architecture.md#pwa)）。
 * ランチャーが出せる数には上限（多くは 4 件）があるので、よく使う順に並べる。
 * 読むのはビルド時（manifest とアイコンの生成）だけなので、React にも zod にも依存させない。
 */
export const SHORTCUTS = [
  { kind: 'calendar', name: 'カレンダー', shortName: 'カレンダー', url: '/calendar?view=month' },
  { kind: 'event', name: '予定登録', shortName: '予定', url: '/calendar?view=day&add=event' },
  { kind: 'task', name: 'タスク登録', shortName: 'タスク', url: '/calendar?add=task' },
  { kind: 'expense', name: '立替登録', shortName: '立替', url: '/expenses?add=expense' },
  { kind: 'lemon', name: 'レモンの記録', shortName: 'レモン', url: '/lemon?add=lemon' },
] as const;

export type ShortcutKind = (typeof SHORTCUTS)[number]['kind'];

/** アイコンの置き場所（`pnpm icons:generate` が `public` の下の同じ道へ書き出す） */
export function shortcutIconSrc(kind: ShortcutKind): string {
  return `/icons/shortcut-${kind}-192.png`;
}
