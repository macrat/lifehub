/**
 * スクワークル（角丸の四角形の辺までなだらかに膨らませた形。超楕円 |x|^n + |y|^n = 1 の n = 4）を
 * 切り抜く CSS の `clip-path`。点は割合で書くので、どの大きさの要素にもそのまま掛けられる。
 * WHY NOT `corner-shape: squircle`: Safari が対応していない（このアプリは iOS の Safari でも使う）。
 * WHY NOT 角丸（border-radius）: 辺がまっすぐなまま角だけが丸くなり、辺まで丸みを帯びた形にならない。
 */
const EXPONENT = 4;
const POINTS = 64;

function squirclePolygon(): string {
  const points = Array.from({ length: POINTS }, (_, i) => {
    const t = (2 * Math.PI * i) / POINTS;
    const x = Math.sign(Math.cos(t)) * Math.abs(Math.cos(t)) ** (2 / EXPONENT);
    const y = Math.sign(Math.sin(t)) * Math.abs(Math.sin(t)) ** (2 / EXPONENT);
    return `${(50 + 50 * x).toFixed(2)}% ${(50 + 50 * y).toFixed(2)}%`;
  });
  return `polygon(${points.join(', ')})`;
}

export const SQUIRCLE_CLIP_PATH = squirclePolygon();
