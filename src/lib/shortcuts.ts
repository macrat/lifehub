import { addUrl } from './add-pages.ts';

/**
 * PWA のショートカット（manifest の `shortcuts`。[architecture.md](../../docs/architecture.md#pwa)）。
 * ランチャーが出せる数には上限（多くは 4 件）があるので、よく使う順に並べる。
 * 読むのはビルド時（manifest とアイコンの生成）だけなので、React にも zod にも依存させない。
 */
export const SHORTCUTS = [
  { kind: 'calendar', name: 'カレンダー', shortName: 'カレンダー', url: '/calendar' },
  { kind: 'event', name: '予定登録', shortName: '予定', url: addUrl('/calendar', 'event') },
  { kind: 'task', name: 'タスク登録', shortName: 'タスク', url: addUrl('/calendar', 'task') },
  { kind: 'expense', name: '立替登録', shortName: '立替', url: addUrl('/money', 'expense') },
  { kind: 'lemon', name: 'レモンの記録', shortName: 'レモン', url: addUrl('/lemon', 'lemon') },
] as const;

type ShortcutKind = (typeof SHORTCUTS)[number]['kind'];

/** アイコンの置き場所（`pnpm icons:generate` が `public` の下の同じ道へ書き出す） */
export function shortcutIconSrc(kind: ShortcutKind): string {
  return `/icons/shortcut-${kind}-192.png`;
}
