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
});
