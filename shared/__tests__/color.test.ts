import { type Color, clampRgb, converter, formatHex, parse, wcagContrast } from 'culori';
import { describe, expect, it } from 'vitest';
import { DEFAULT_HUE, FILL_TEXT, hueColor, pickDistinctHue, type Tone } from '../color.ts';

const TONES: Tone[] = ['accent', 'fill', 'line', 'mark', 'tint'];
const MODES = ['light', 'dark'] as const;
const HUES = Array.from({ length: 360 }, (_, i) => i);

function parseColor(css: string): Color {
  const color = parse(css);
  if (!color) throw new Error(`CSS の色として読めない: ${css}`);
  return color;
}

const toP3 = converter('p3');

/**
 * 画面が描ける色にしたときの候補。色域外の色の扱いはブラウザと画面で違う（広色域の画面は P3 まで出し、
 * sRGB の画面では切り詰める）ので、どちらになっても成り立つべき性質はすべてについて確かめる。
 */
function renderings(css: string): Color[] {
  const color = parseColor(css);
  const p3 = toP3(color);
  const clip = (v: number) => Math.min(1, Math.max(0, v));
  return [color, clampRgb(color), { ...p3, r: clip(p3.r), g: clip(p3.g), b: clip(p3.b) }];
}

describe('hueColor', () => {
  it('CSS の oklch() として読める色を返す', () => {
    for (const mode of MODES) {
      for (const tone of TONES) {
        for (const hue of [null, 0, 120, 240, 359, 720, -30]) {
          expect(parseColor(hueColor(hue, tone, mode)).mode).toBe('oklch');
        }
      }
    }
  });

  it('色相が null なら無彩色（彩度 0）になる', () => {
    for (const mode of MODES) {
      for (const tone of TONES) {
        const hex = formatHex(parseColor(hueColor(null, tone, mode)));
        expect(hex.slice(1, 3)).toBe(hex.slice(3, 5));
        expect(hex.slice(3, 5)).toBe(hex.slice(5, 7));
      }
    }
  });

  it('色相は 0〜359 に丸める（範囲外や小数も同じ色相の色になる）', () => {
    expect(hueColor(360, 'fill', 'light')).toBe(hueColor(0, 'fill', 'light'));
    expect(hueColor(-30, 'fill', 'light')).toBe(hueColor(330, 'fill', 'light'));
    expect(hueColor(12.4, 'fill', 'light')).toBe(hueColor(12, 'fill', 'light'));
  });

  it('帯と帯の文字は、どの色相でも、どの色域で描いてもコントラスト比 7:1（WCAG AAA）以上になる', () => {
    for (const mode of MODES) {
      for (const hue of [null, ...HUES]) {
        for (const rendered of renderings(hueColor(hue, 'fill', mode))) {
          expect(wcagContrast(rendered, FILL_TEXT), `${mode} ${hue}`).toBeGreaterThanOrEqual(7);
        }
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
