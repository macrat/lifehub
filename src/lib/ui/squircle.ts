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

/** 角の曲線を書く点の数（1 つの角あたり） */
const CORNER_POINTS = 24;

/**
 * 角だけなめらかな角丸（辺はまっすぐで、角が円弧ではなく超楕円の 1/4 でつながる。iOS のアイコンの角と同じ考え方）を
 * 切り抜く CSS の `mask`。角の大きさ（extent px）は要素の大きさによらず一定なので、横長の要素でも角の丸みが揃う。
 * 4 つの角を SVG で描き、残りの十字形を塗りつぶしで埋める。
 * WHY NOT clip-path の polygon: 点を割合で書くと要素の大きさに比例して角が伸び、px で書くと大きさごとに作り直しになる。
 */
function smoothCornersMask(extent: number): string {
  const quadrant = Array.from({ length: CORNER_POINTS + 1 }, (_, i) => {
    const t = (Math.PI / 2) * (i / CORNER_POINTS);
    // 左上の角: 中心 (1, 1)、半径 1 の超楕円の左上の 1/4
    return [1 - Math.cos(t) ** (2 / 4), 1 - Math.sin(t) ** (2 / 4)] as const;
  });
  const corner = (flipX: boolean, flipY: boolean) => {
    const points = [...quadrant, [1, 1] as const]
      .map(([x, y]) => `${flipX ? 1 - x : x},${flipY ? 1 - y : y}`)
      .join(' ');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" preserveAspectRatio="none"><polygon points="${points}"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  };
  const size = `${extent}px ${extent}px`;
  const fill = 'linear-gradient(#000, #000)';
  return [
    `${corner(false, false)} left top / ${size} no-repeat`,
    `${corner(true, false)} right top / ${size} no-repeat`,
    `${corner(false, true)} left bottom / ${size} no-repeat`,
    `${corner(true, true)} right bottom / ${size} no-repeat`,
    `${fill} center / calc(100% - ${2 * extent}px) 100% no-repeat`,
    `${fill} center / 100% calc(100% - ${2 * extent}px) no-repeat`,
  ].join(', ');
}

/**
 * 状況のタイル（立替残高・レモン）の形。角 24px の「角だけなめらか」な角丸で、横長のタイルでも角の丸みが揃う
 * （`SQUIRCLE_CLIP_PATH` は大きさに比例して伸びるので、PC の横長のタイルでは角と辺が膨らみすぎる）
 */
export const TILE_MASK = smoothCornersMask(24);
