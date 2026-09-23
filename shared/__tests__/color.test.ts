import { describe, expect, it } from 'vitest';
import { DEFAULT_HUE, hueColor, oklchToHex, pickDistinctHue } from '../color.ts';

describe('oklchToHex', () => {
  it('ブランドカラーの OKLCH（L 0.49, C 0.205, H 335）がほぼ #A0148C になる', () => {
    expect(oklchToHex(0.4896, 0.2054, 335.47)).toBe('#a0148c');
  });

  it('無彩色は色相によらずグレーになる', () => {
    expect(oklchToHex(0.5, 0, 0)).toBe(oklchToHex(0.5, 0, 180));
  });

  it('色域外の彩度は落として収める（例外を出さず、有効な hex を返す）', () => {
    for (const hue of [0, 60, 120, 180, 240, 300]) {
      expect(oklchToHex(0.9, 0.4, hue)).toMatch(/^#[0-9a-f]{6}$/);
      expect(hueColor(hue, 'accent', 'light')).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('hueColor', () => {
  it('色相が null なら無彩色（R=G=B）になる', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const tone of ['accent', 'fill', 'onFill', 'check', 'mark', 'tint'] as const) {
        const [r, g, b] = channels(hueColor(null, tone, mode));
        expect(r).toBe(g);
        expect(g).toBe(b);
      }
    }
  });

  it('帯と帯の文字は、どの色相でもコントラスト比 7:1（WCAG AAA）以上になる', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const hue of [null, ...Array.from({ length: 360 }, (_, i) => i)]) {
        const ratio = contrast(hueColor(hue, 'fill', mode), hueColor(hue, 'onFill', mode));
        expect(ratio, `${mode} ${hue}`).toBeGreaterThanOrEqual(7);
      }
    }
  });
});

describe('pickDistinctHue', () => {
  it('誰もいなければ既定の色相', () => {
    expect(pickDistinctHue([])).toBe(DEFAULT_HUE);
  });

  it('既存の色相と既定の色相から最も離れた色相を返す', () => {
    const hue = pickDistinctHue([DEFAULT_HUE]);
    expect(Math.abs(hue - DEFAULT_HUE)).toBeGreaterThan(150);
    const second = pickDistinctHue([DEFAULT_HUE, hue]);
    expect(second).not.toBe(hue);
    expect(second).not.toBe(DEFAULT_HUE);
  });
});

/** WCAG 2 のコントラスト比 */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG 2 の相対輝度 */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** hex を R・G・B の 3 値に分解する */
function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}
