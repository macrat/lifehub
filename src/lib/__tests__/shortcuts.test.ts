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
   * 「カレンダー」が約束しているのは月表示。既定に頼って `view` を落とすと、既定を変えた日に
   * 黙って別の表示になるので、URL 自体が月表示を指していることを確かめる。
   * 入力を開くショートカット（`add`）は、実際に入力が開くところまで E2E で見る。
   */
  it('カレンダーは既定に頼らず月表示を指している', () => {
    const calendar = SHORTCUTS.find((s) => s.kind === 'calendar');
    if (!calendar) throw new Error('カレンダーのショートカットが無い');
    const { searchParams } = new URL(calendar.url, 'https://lifehub.invalid');
    expect(searchParams.get('view')).toBe('month');
  });
});
