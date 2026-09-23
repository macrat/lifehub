/**
 * 複数の色を中心の周りに等分して置く向きの計算（`WedgeFill` の塗り分けと `VennMark` の円の配置）。
 * 同じ向きを両方が使うので、同じ参加者なら印とチェックボックスで同じ位置に同じ色が来る。
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
 * 2 つは左上と右上に分ける 45° の斜め（/）、4 つは十字。どちらも角度で決まるので conic-gradient で描く。
 * 3 つは Y の字で、上の 2 本の境目は中心から左上と右上の角へ引く（縦横比が変わっても角に届く）。
 * WHY 3 つを角へ: `WedgeFill` と同じ 120° ずつだと、横長の帯では上の人の面が中央の小さな三角になる。
 * 角へ引けば上の面はどの縦横比でも全体の 1/4 になり、T の字に近い開き方で上の人の色も見える。
 * 角へ引く斜めの線は、上半分を左右に分けた箱それぞれの対角線なので、
 * 箱の角に向かう linear-gradient（`to top right` の 50% の線は箱の左上と右下の角を通る）で描ける。
 * WHY 2 つを斜めに: 帯は横に長く、縦の境目だと左右に並んだ 2 つの予定のように見える。
 */
export function wedgeBackground(colors: string[]): string {
  const [a, b, c] = colors;
  switch (colors.length) {
    case 1:
      return String(a);
    case 2:
      return `conic-gradient(from 225deg, ${a} 0 180deg, ${b} 180deg 360deg)`;
    case 3:
      return [
        `linear-gradient(to top right, transparent 50%, ${b} 50%) left top / 50% 50% no-repeat`,
        `linear-gradient(to top left, transparent 50%, ${b} 50%) right top / 50% 50% no-repeat`,
        `linear-gradient(to right, ${a} 50%, ${c} 50%)`,
      ].join(', ');
    default: {
      // 4 つ以上は 1 つ目が左下から時計回り（4 つなら十字）
      const step = 360 / colors.length;
      const stops = colors.map((color, i) => `${color} ${i * step}deg ${(i + 1) * step}deg`);
      return `conic-gradient(from 180deg, ${stops.join(', ')})`;
    }
  }
}
