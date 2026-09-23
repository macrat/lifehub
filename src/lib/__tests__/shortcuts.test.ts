import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SHORTCUTS, shortcutIconSrc } from '../shortcuts.ts';

describe('ショートカット', () => {
  /**
   * アイコンは生成してコミットする（`pnpm icons:generate`）。足したときに生成を忘れると
   * 絵の無いショートカットになるので、一覧に対して実物があることを確かめる。
   */
  it('一覧のすべてにアイコンが生成されている', () => {
    for (const { kind } of SHORTCUTS) {
      expect(existsSync(`public${shortcutIconSrc(kind)}`), kind).toBe(true);
    }
  });

  /**
   * カレンダーを開くショートカットは、下部ナビのタブと同じく最後に開いた表示で開く。
   * `view` を付けると、その表示に固定されたうえ、それが「最後に開いた表示」として覚えられてしまう。
   * 入力を開くショートカット（`add`）は、実際に入力が開くところまで E2E で見る。
   */
  it('カレンダーを開くものは表示を指定しない', () => {
    for (const { url } of SHORTCUTS.filter((s) => s.url.startsWith('/calendar'))) {
      const { searchParams } = new URL(url, 'https://lifehub.invalid');
      expect(searchParams.get('view'), url).toBeNull();
    }
  });
});
