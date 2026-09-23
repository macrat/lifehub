/**
 * ユーザーの色。ユーザーは OKLCH の色相（0〜359）だけを選び、彩度と明度はアプリ側が用途ごとに決めて使い回す。
 * OKLCH は色相を変えても知覚的な明るさ・鮮やかさが揃うので、どの色相を選んでも同じ強さの色になる。
 *
 * MUI のパレットは hex/rgb を要求するため、ここで OKLCH → sRGB の変換を持つ（CSS の oklch() には頼らない）。
 * sRGB の色域から外れる場合は彩度を落として収める。
 */

/** アプリ既定の色相（ブランドカラー #A0148C の色相）。ログイン前の画面と、ユーザー登録時の既定値に使う。 */
export const DEFAULT_HUE = 335;

export const HUE_MAX = 359;

/**
 * 面（背景）の色。ライト／ダークそれぞれ 1 色で、AppBar も下部ナビもシートもこれと同じ色にする。
 * ブラウザに渡す `theme-color`（`vite.config.ts` が index.html に注入する）も同じ値にして、
 * スマホのステータスバーと AppBar が地続きに見えるようにする。
 */
export const SURFACE = { light: '#ffffff', dark: '#121212' } as const;

/** 用途ごとの明度・彩度。light/dark は表示モード。 */
const TONES = {
  /** アクセント（primary）。ボタン・選択状態・FAB など */
  accent: { light: { l: 0.49, c: 0.19 }, dark: { l: 0.72, c: 0.15 } },
  /**
   * カレンダーの帯など、文字（`FILL_TEXT`）が載る面。彩度を抑えて明るくしたパステル調にする。
   * WHY: 帯は画面に数多く並ぶので、鮮やかで暗い色だと画面全体が重くなる。
   * 明るい面に暗い文字を載せれば、色相によらず文字とのコントラストを保てる（白い文字は明るい面では読めない）。
   * ダークモードでも暗い面の上で浮きすぎないよう、ライトモードより一段暗くする。
   */
  fill: { light: { l: 0.87, c: 0.07 }, dark: { l: 0.8, c: 0.08 } },
  /**
   * 白い（暗い）面の上に描く細い線や小さな印（タスクのチェックボックス `SplitCheckboxIcon`、下書きの枠、
   * 時間軸のタスクの左の線）。fill は面として使うための淡い色で、線にすると面に埋もれて見えないので、
   * ここは暗く鮮やかにする。文字が載らないので、鮮やかにしても読みにくくならない。
   */
  check: { light: { l: 0.58, c: 0.2 }, dark: { l: 0.7, c: 0.18 } },
  /**
   * 一覧の左の印（`VennMark`）。白い面の上の小さな円なので、fill ほど淡いと面に埋もれ、
   * check ほど暗いと重く見える。その間の明るさにする。
   */
  mark: { light: { l: 0.68, c: 0.14 }, dark: { l: 0.7, c: 0.13 } },
  /** 帯の薄い背景（時間指定の予定など）。文字は本文色 */
  tint: { light: { l: 0.93, c: 0.04 }, dark: { l: 0.3, c: 0.06 } },
} as const;

/**
 * fill の上に載せる文字色。fill はどの色相・表示モードでも明るいので、無彩色の暗い 1 色で足りる。
 * どの fill ともコントラスト比 7:1（WCAG AAA）以上。塗り分けた面（境目をまたぐ文字）にもこの 1 色を使う。
 * WHY NOT 真っ黒: パステルの面の上では黒が強すぎて浮くので、わずかに明るくする。
 */
export const FILL_TEXT = '#1f1f1f';

export type ColorMode = 'light' | 'dark';
export type Tone = keyof typeof TONES;

/**
 * 色相と用途から hex を返す。色相が null なら彩度 0 の無彩色（共有の項目の色）。
 * 共有の項目は特定のユーザーのものではないので、どのユーザーの色とも競合しない無彩色にする。
 * 明度は用途ごとの値をそのまま使う。
 */
export function hueColor(hue: number | null, tone: Tone, mode: ColorMode): string {
  const { l, c } = TONES[tone][mode];
  return hue === null ? oklchToHex(l, 0, 0) : oklchToHex(l, c, normalizeHue(hue));
}

/** 色相の一覧表示（スライダーの帯など）用。24 段階の hex を返す */
export function hueRamp(tone: Tone, mode: ColorMode, steps = 24): string[] {
  return Array.from({ length: steps }, (_, i) => hueColor((360 / steps) * i, tone, mode));
}

/** 既存のユーザーと離れた色相を選ぶ（黄金角で回す）。管理画面で色を指定しなかったときの既定値 */
export function pickDistinctHue(existing: number[]): number {
  if (existing.length === 0) return DEFAULT_HUE;
  // 使用中の色相から最も遠い点を 0〜359 の総当たりで探す（要素数はごく少ない）
  let best = 0;
  let bestDistance = -1;
  for (let h = 0; h < 360; h += 1) {
    const distance = Math.min(
      ...existing.map((e) => hueDistance(h, e)),
      hueDistance(h, DEFAULT_HUE),
    );
    if (distance > bestDistance) {
      best = h;
      bestDistance = distance;
    }
  }
  return best;
}

function normalizeHue(hue: number): number {
  return ((Math.round(hue) % 360) + 360) % 360;
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(normalizeHue(a) - normalizeHue(b));
  return Math.min(d, 360 - d);
}

/**
 * OKLCH → sRGB hex。色域外なら彩度を段階的に下げて収める（色相と明度は保つ）。
 * 変換式は Björn Ottosson の OKLab 定義に従う。
 */
export function oklchToHex(l: number, c: number, h: number): string {
  for (let chroma = c; chroma >= 0; chroma -= 0.005) {
    const rgb = oklchToLinearSrgb(l, chroma, h);
    if (rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4)) {
      return `#${rgb.map((v) => toHexByte(linearToSrgb(clamp01(v)))).join('')}`;
    }
  }
  const rgb = oklchToLinearSrgb(l, 0, h);
  return `#${rgb.map((v) => toHexByte(linearToSrgb(clamp01(v)))).join('')}`;
}

function oklchToLinearSrgb(l: number, c: number, h: number): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}

function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function toHexByte(v: number): string {
  return Math.round(v * 255)
    .toString(16)
    .padStart(2, '0');
}
