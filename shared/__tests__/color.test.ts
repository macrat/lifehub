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
