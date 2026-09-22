/**
 * PWA のショートカット（manifest の `shortcuts`）の種類。
 * manifest を書く `vite.config.ts` と、アイコンを生成する `scripts/generate-icons.ts` が
 * この型と `shortcutIconSrc` を共有するので、片方だけ増やすと型で止まる（絵の無いショートカットを作らない）。
 */
export type ShortcutKind = 'calendar' | 'event' | 'task' | 'expense' | 'lemon';

/** ショートカットのアイコンの置き場所（生成するときの書き出し先は `public` の下の同じ道） */
export function shortcutIconSrc(kind: ShortcutKind): string {
  return `/icons/shortcut-${kind}-192.png`;
}
