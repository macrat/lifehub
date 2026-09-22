import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calendarSearchSchema } from '../../features/calendar/use-calendar-page.ts';
import { SHORTCUTS, shortcutIconSrc } from '../shortcuts.ts';

/** ショートカット 1 つ分の URL の検索パラメータ */
function searchOf(kind: (typeof SHORTCUTS)[number]['kind']): Record<string, string> {
  const shortcut = SHORTCUTS.find((s) => s.kind === kind);
  if (!shortcut) throw new Error(`${kind} のショートカットが無い`);
  return Object.fromEntries(new URL(shortcut.url, 'https://lifehub.invalid').searchParams);
}

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
   * 黙って別の表示になるので、URL 自体が月表示を指していることを画面の検索パラメータで確かめる。
   * 入力を開くショートカット（`add`）は、実際に入力が開くところまで E2E で見る。
   */
  it('カレンダーは月表示を指している', () => {
    expect(calendarSearchSchema.parse(searchOf('calendar')).view).toBe('month');
  });
});
