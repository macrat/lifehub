/**
 * ユーザーの色。ユーザーは OKLCH の色相（0〜359）だけを選び、彩度と明度はアプリ側が用途ごとに決めて使い回す。
 * OKLCH は色相を変えても知覚的な明るさ・鮮やかさが揃うので、どの色相を選んでも同じ強さの色になる。
 *
 * 色は CSS の `oklch()` のまま渡し、変換はブラウザに任せる（MUI のパレットも `nativeColor` で
 * `oklch()` を受ける。`src/lib/theme.ts`）。画面の色域（sRGB / Display P3）から外れる色の扱いも
 * ブラウザが決めるので、広色域の画面ではどの色相でも指定した彩度のまま出る。
 * WHY NOT sRGB の hex に変換して渡す: 変換と色域外の扱い（彩度を落として収める）を自前で持つことになり、
 * 広色域の画面でも sRGB の範囲に押し込めてしまう。
 * 色域外の色は画面によって少し違って見えるが、帯の文字のコントラスト（`FILL_TEXT`）は、どちらの色域に
 * 切り詰めても保てることをテストで確かめている（shared/__tests__/color.test.ts）。
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
   * 無地の面（白／暗い背景）の上に描く細い線や小さな印（チェックボックス、下書きの枠など）。
   * fill は面として使うための淡い色で、線にすると面に埋もれて見えないので、ここは暗く鮮やかにする。
   * 文字が載らないので、鮮やかにしても読みにくくならない。
   */
  line: { light: { l: 0.58, c: 0.2 }, dark: { l: 0.7, c: 0.18 } },
  /**
   * 一覧の左の印（`VennMark`）。白い面の上の小さな円なので、fill ほど淡いと面に埋もれ、
   * line ほど暗いと重く見える。その間の明るさにする。
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
 * 色相と用途から CSS の色（`oklch()`）を返す。色相が null なら彩度 0 の無彩色（共有の項目の色）。
 * 共有の項目は特定のユーザーのものではないので、どのユーザーの色とも競合しない無彩色にする。
 * 明度は用途ごとの値をそのまま使う。
 */
export function hueColor(hue: number | null, tone: Tone, mode: ColorMode): string {
  const { l, c } = TONES[tone][mode];
  return hue === null ? `oklch(${l} 0 0)` : `oklch(${l} ${c} ${normalizeHue(hue)})`;
}

/** 色相の一覧表示（スライダーの帯など）用。24 段階の色を返す */
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
