/**
 * スクワークル（角丸の四角形の辺までなだらかに膨らませた形。超楕円 |x|^n + |y|^n = 1 の n = 4）を
 * 切り抜く CSS の `clip-path`。点は割合で書くので、どの大きさの要素にもそのまま掛けられる。
 * WHY NOT `corner-shape: squircle`: Safari が対応していない（このアプリは iOS の Safari でも使う）。
 * WHY NOT 角丸（border-radius）: 辺がまっすぐなまま角だけが丸くなり、辺まで丸みを帯びた形にならない。
 *
 * clip-path は要素の影（box-shadow）も切り取ってしまうので、影が要る物は外側の要素に
 * `SQUIRCLE_SHADOW`（切り抜いた形に沿う drop-shadow）を掛ける。
 *
 * 辺はまっすぐで角だけを同じ超楕円でつなぐ「角だけなめらか」な角丸（`smoothCornersMask`）も、ここで作る。
 */
const POINTS = 64;

/** 形に使う超楕円の指数 */
const EXPONENT = 4;

/** 超楕円 |x|^n + |y|^n = 1 の上で、角度 t（ラジアン）の向きにある点。n = 2 は円 */
function superellipsePoint(t: number, exponent: number): readonly [x: number, y: number] {
  return [
    Math.sign(Math.cos(t)) * Math.abs(Math.cos(t)) ** (2 / exponent),
    Math.sign(Math.sin(t)) * Math.abs(Math.sin(t)) ** (2 / exponent),
  ];
}

/** 超楕円を POINTS 個の点で書いた polygon */
function superellipse(exponent: number): string {
  const points = Array.from({ length: POINTS }, (_, i) => {
    const [x, y] = superellipsePoint((2 * Math.PI * i) / POINTS, exponent);
    return `${(50 + 50 * x).toFixed(2)}% ${(50 + 50 * y).toFixed(2)}%`;
  });
  return `polygon(${points.join(', ')})`;
}

export const SQUIRCLE_CLIP_PATH = superellipse(EXPONENT);

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
 * 左上の角で、超楕円の 1/4（中心 (1, 1)、半径 1）より外の部分（1 × 1 の箱の中）。
 * 四角から切り落とす所で、左右・上下に裏返してほかの角にも使う
 */
const CORNER_OUTSIDE = [
  ...Array.from({ length: CORNER_POINTS + 1 }, (_, i) => {
    const [x, y] = superellipsePoint((Math.PI / 2) * (i / CORNER_POINTS), EXPONENT);
    // 24px の角でも 0.03px 以下の差なので、3 桁に丸めて mask の文字列を短くする
    return `${(1 - x).toFixed(3)},${(1 - y).toFixed(3)}`;
  }),
  '0,0',
].join(' ');

type SmoothCornersOptions = {
  /** 左端の角を丸めるか（既定は丸める） */
  roundStart?: boolean;
  /** 右端の角を丸めるか（既定は丸める） */
  roundEnd?: boolean;
  /** 与えると、内側をくり抜いてこの太さ（px）の線だけを残す（枠の線） */
  line?: number;
};

/** 作った形を置く文書全体の CSS 変数の名前（引数ごとに 1 つ） */
const registered = new Set<string>();
let sheet: CSSStyleSheet | undefined;

/** 形の値を `:root` の CSS 変数として一度だけ文書に足す */
function register(name: string, value: string) {
  if (registered.has(name)) return;
  registered.add(name);
  sheet ??= document.head.appendChild(document.createElement('style')).sheet ?? undefined;
  sheet?.insertRule(`:root { ${name}: ${value}; }`);
}

/**
 * 角だけなめらかな角丸（辺はまっすぐで、角が円弧ではなく超楕円の 1/4 でつながる。iOS のアイコンの角と同じ考え方）を
 * 切り抜く CSS の `mask`。角の大きさ（extent px）は要素の大きさによらず一定なので、横長の要素でも角の丸みが揃う。
 * viewBox を持たない 1 枚の SVG で、要素いっぱいの四角から、四隅に px の大きさで置いた「曲線より外」を切り落とす
 * （右と下の角は、`x="100%"`・`y="100%"` の入れ子の svg で端に置いて裏返す）。
 * 枠の線（`line`）は、四角の縁に線を引き、内側の角（線の太さだけ小さい）の「曲線より外」を線の側へ戻して作る。
 * 返すのは `var(--…)` の短い参照で、形そのもの（1〜2KB の data URI）は引数ごとに一度だけ作り、`:root` の CSS 変数として
 * 文書に置く。sx でも疑似要素でも、項目の数やドラッグの 1 コマごとに長い文字列を CSS や style 属性へ複製しない。
 * WHY NOT border-radius: 角が円弧になり、なめらかにつながらない。
 * WHY NOT clip-path の polygon: 点を割合で書くと要素の大きさに比例して角が伸び、px で書くと大きさごとに作り直しになる。
 * WHY NOT 角と辺を mask の別々の層で描く: 層の境目が端数の位置に来ると筋や段差が出る。角を縮めて収める作りでは、
 * 小さな枠で角の線だけが細くなる。1 枚の SVG なら 1 度に描かれ、線の太さも px のまま変わらない。
 * 描く手間は border-radius より重い（要素の大きさごとに SVG を描き直し、切り抜いた面を重ねる）。
 * 特に大きさが変わり続ける間（つまんでいる下書きの枠、時間軸を 2 本の指で伸び縮みさせている間の予定のブロック）は
 * 1 コマごとに描き直す。WHY 受け入れる: 同じ形を描ける CSS（`corner-shape: squircle`）は Safari が対応していない。
 */
export function smoothCornersMask(
  extent: number,
  { roundStart = true, roundEnd = true, line = 0 }: SmoothCornersOptions = {},
): string {
  const name = `--smooth-corners-${extent}-${Number(roundStart)}${Number(roundEnd)}-${line}`;
  if (registered.has(name)) return `var(${name})`;

  // 角ごとに「曲線より外」を置く。x・y は置く端、sx・sy は裏返す向き、inset は端から内へずらす量、size は角の大きさ
  const corners = (size: number, inset: number, color: string) =>
    [
      { x: '0', y: '0', sx: 1, sy: 1, rounded: roundStart },
      { x: '100%', y: '0', sx: -1, sy: 1, rounded: roundEnd },
      { x: '0', y: '100%', sx: 1, sy: -1, rounded: roundStart },
      { x: '100%', y: '100%', sx: -1, sy: -1, rounded: roundEnd },
    ]
      .filter((c) => c.rounded)
      .map(
        ({ x, y, sx, sy }) =>
          `<svg x="${x}" y="${y}" overflow="visible"><use href="#c" fill="${color}" transform="translate(${sx * inset} ${sy * inset}) scale(${sx * size} ${sy * size})"/></svg>`,
      )
      .join('');
  const shape =
    line > 0
      ? // 内側を黒で塗って縁の線だけ白く残し、内側の角の曲線より外を白で線に足す
        `<rect width="100%" height="100%" fill="#000" stroke="#fff" stroke-width="${2 * line}"/>${corners(extent - line, line, '#fff')}`
      : '<rect width="100%" height="100%" fill="#fff"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><defs><polygon id="c" points="${CORNER_OUTSIDE}"/></defs><mask id="m">${shape}${corners(extent, 0, '#000')}</mask><rect width="100%" height="100%" mask="url(#m)"/></svg>`;
  register(name, `url("data:image/svg+xml,${encodeURIComponent(svg)}") 0 0 / 100% 100% no-repeat`);
  return `var(${name})`;
}

/**
 * 状況のタイル（立替残高・レモン）の形。角 24px の「角だけなめらか」な角丸で、横長のタイルでも角の丸みが揃う
 * （`SQUIRCLE_CLIP_PATH` は大きさに比例して伸びるので、PC の横長のタイルでは角と辺が膨らみすぎる）
 */
export const TILE_MASK = smoothCornersMask(24);
