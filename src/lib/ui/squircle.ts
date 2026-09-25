/**
 * スクワークル（角丸の四角形の辺までなだらかに膨らませた形。超楕円 |x|^n + |y|^n = 1 の n = 4）を
 * 切り抜く CSS の `clip-path`。点は割合で書くので、どの大きさの要素にもそのまま掛けられる。
 * WHY NOT `corner-shape: squircle`: Safari が対応していない（このアプリは iOS の Safari でも使う）。
 * WHY NOT 角丸（border-radius）: 辺がまっすぐなまま角だけが丸くなり、辺まで丸みを帯びた形にならない。
 *
 * clip-path は要素の影（box-shadow）も切り取ってしまうので、影が要る物は外側の要素に
 * `SQUIRCLE_SHADOW`（切り抜いた形に沿う drop-shadow）を掛ける。
 */
const POINTS = 64;

/** 超楕円 |x|^n + |y|^n = 1 を POINTS 個の点で書いた polygon。n = 2 は円 */
function superellipse(exponent: number): string {
  const points = Array.from({ length: POINTS }, (_, i) => {
    const t = (2 * Math.PI * i) / POINTS;
    const x = Math.sign(Math.cos(t)) * Math.abs(Math.cos(t)) ** (2 / exponent);
    const y = Math.sign(Math.sin(t)) * Math.abs(Math.sin(t)) ** (2 / exponent);
    return `${(50 + 50 * x).toFixed(2)}% ${(50 + 50 * y).toFixed(2)}%`;
  });
  return `polygon(${points.join(', ')})`;
}

export const SQUIRCLE_CLIP_PATH = superellipse(4);

/**
 * 円を `SQUIRCLE_CLIP_PATH` と同じ数の点で書いたもの。点の数が同じ polygon どうしは clip-path の
 * transition で補間されるので、スクワークルから円へ形がなめらかに変わる（追加ボタンを開いたとき）
 */
export const CIRCLE_CLIP_PATH = superellipse(2);

/**
 * 切り抜いた形に沿う影（MUI の elevation 3 に近いもの）。切り抜く要素そのものではなく、その外側に掛ける
 * （`filter` は `clip-path` より先に描かれるので、同じ要素に掛けると影ごと切り取られる）
 */
export const SQUIRCLE_SHADOW =
  'drop-shadow(0 2px 2px rgb(0 0 0 / 0.2)) drop-shadow(0 1px 6px rgb(0 0 0 / 0.14))';
