/**
 * 複数の色を中心の周りに分けて置く規則。向きの計算（`WedgeFill` の塗り分けと `VennMark` の円の配置）と、
 * 帯・ブロックの面を塗り分ける CSS の背景（`wedgeBackground`）。
 * どれも色の並びが同じなので、同じ参加者なら印・チェックボックス・帯で同じ位置に同じ色が来る。
 */

/**
 * n 個を並べる向き（ラジアン、y は下向き）。始めの角度を 90° + 180°/n にすると、
 * どの数でも底辺が水平になり、1 つ目が左（2 つのとき）・左下（3 つ以上のとき）に来る。
 */
export function wedgeAngles(count: number): number[] {
  const start = Math.PI / 2 + Math.PI / count;
  return Array.from({ length: count }, (_, i) => start + (2 * Math.PI * i) / count);
}

/** 中心から角度 angle の向きに distance 離れた点 */
export function pointAt(angle: number, distance: number): { x: number; y: number } {
  return { x: distance * Math.cos(angle), y: distance * Math.sin(angle) };
}

/**
 * 面を塗り分ける CSS の背景（帯・ブロック）。色の並びは `WedgeFill` と同じで、1 つ目が左（左下）に来る。
 * 2 つは左上と右下に分ける 45° の斜め（/）、4 つは十字。どちらも角度で決まるので conic-gradient で描く。
 * 3 つは Y の字で、上の 2 本の境目は中心から左上と右上の角へ引く（縦横比が変わっても角に届く）。
 * WHY 3 つを角へ: `WedgeFill` と同じ 120° ずつだと、横長の帯では上の人の面が中央の小さな三角になる。
 * 角へ引けば上の面はどの縦横比でも全体の 1/4 になり、T の字に近い開き方で上の人の色も見える。
 * 角へ引く線は面の対角線の上半分なので、角に向かう linear-gradient（`to top right` の 50% の線は
 * 左上と右下の角を通る）で描ける。上の人の色を敷き、左の対角線の下を 1 人目、右の対角線の下を 3 人目で
 * 塗り、下半分の左を 1 人目に戻す。層を重ねるので、色は不透明なものを渡す（半透明だと下の層が透ける）。
 * WHY 面いっぱいの層で描く: 50% の箱を並べると、幅が端数のときに箱の間から下の層が 1px の線で見える。
 * 箱を使うのは下半分の左だけで、その縁は同じ色（1 人目・3 人目）の上にしか来ない。
 * WHY 2 つを斜めに: 帯は横に長く、縦の境目だと左右に並んだ 2 つの予定のように見える。
 */
export function wedgeBackground(colors: string[]): string {
  const [a, b, c] = colors;
  switch (colors.length) {
    case 1:
      return `${a}`;
    case 2:
      return `conic-gradient(from 225deg, ${a} 0 180deg, ${b} 180deg 360deg)`;
    case 3:
      return [
        `linear-gradient(${a}, ${a}) left bottom / 50% 50% no-repeat`,
        `linear-gradient(to top left, ${c} 50%, transparent 50%)`,
        `linear-gradient(to top right, ${a} 50%, transparent 50%)`,
        `${b}`,
      ].join(', ');
    default: {
      // 4 つ以上は 1 つ目が左下から時計回り（4 つなら十字）
      const step = 360 / colors.length;
      const stops = colors.map((color, i) => `${color} ${i * step}deg ${(i + 1) * step}deg`);
      return `conic-gradient(from 180deg, ${stops.join(', ')})`;
    }
  }
}

/**
 * `wedgeBackground` で塗り分けた面の、角の近く（角から少し内に寄せた上下の辺）の色。
 * 面の上に単色で置く小さな部品（下書きの端をつまむ丸など）を、その場所の色に揃えるために使う。
 * 2 つ・3 つ・4 つは境目が角・辺の中点を通るので縦横比によらず決まる。
 * 5 つ以上は角の向き（45° の斜め）で見た色で、縦横比が極端だと隣の色になることがある。
 */
export function wedgeColorNear(colors: string[], corner: 'top-left' | 'bottom-right'): string {
  const [a, b, c] = colors;
  const topLeft = corner === 'top-left';
  switch (colors.length) {
    case 1:
      return `${a}`;
    case 2:
      return `${topLeft ? a : b}`;
    case 3:
      // 上の辺はすべて上の人の面、下の辺の右半分は右下の人の面
      return `${topLeft ? b : c}`;
    default: {
      // conic-gradient と同じく真上が 0° で時計回り、1 つ目は 180° から
      const step = 360 / colors.length;
      const angle = topLeft ? 315 : 135;
      return `${colors[Math.floor(((angle - 180 + 360) % 360) / step)]}`;
    }
  }
}
