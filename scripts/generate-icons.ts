import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { type ComponentType, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CARE_TYPE_ICONS } from '../src/features/lemon/care-type-icons.tsx';
import { ADD_KINDS } from '../src/lib/add-kinds.ts';
import { SHORTCUTS, shortcutIconSrc } from '../src/lib/shortcuts.ts';
import { calendarNavItem } from '../src/navigation.ts';

/**
 * PWA 用の PNG と、レモンの記録ボタン（`iot/lemon-record-button/`）の画面に出すアイコンを生成する。
 * 元は `public/icons/` の SVG（アプリのアイコンと通知の印）と、アプリが使っている MUI のアイコン
 * （ショートカットと記録ボタン）。
 * 通知の印だけは背景の板を持たない字だけの形にしてある。Android はこれを alpha だけの単色として
 * ステータスバーに出すので、色付きの板があると塗り潰れた四角になるため。
 *
 * 画像ライブラリを増やさず、開発依存に既にある Playwright の Chromium でラスタライズする。
 * アイコンを変えたときだけ実行し、生成物はコミットする。
 */
const icon = readFileSync('public/icons/favicon.svg', 'utf8');
const badge = readFileSync('public/icons/badge.svg', 'utf8');

/** アプリのアイコンの板と同じブランドカラー（`public/icons/favicon.svg`） */
const BRAND = '#A0148C';

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});

async function render(svg: string, size: number, padding: number, file: string): Promise<void> {
  // maskable（余白あり）は背景を塗りつぶし、それ以外は SVG の角丸を活かすため背景を透過にする
  const background = padding > 0 ? BRAND : 'transparent';
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  const inner = size - padding * 2;
  await page.setContent(
    `<body style="margin:0;background:${background}"><div style="position:absolute;inset:${padding}px;width:${inner}px;height:${inner}px">${svg}</div></body>`,
  );
  await page.locator('body').screenshot({ path: file, omitBackground: padding === 0 });
  await page.close();
}

/**
 * MUI のアイコンを描き出して、viewBox と中身（path）に分ける。
 * 絵は React コンポーネントをそのまま描き出して使うので、path をここへ書き写して二重に持たない。
 * viewBox はアイコンごとに違う（Material Symbols から持ってきた葉は 960 四方）ので、描き出したものから取る。
 */
function glyphOf(Icon: ComponentType): { viewBox: string; body: string } {
  // MUI が返すのは emotion の <style> と <svg viewBox="...">。どちらも剥がして中身（path）にする
  const markup = renderToStaticMarkup(createElement(Icon)).replace(/^<style[\s\S]*?<\/style>/, '');
  const viewBox = markup.match(/^<svg[^>]*\sviewBox="([^"]+)"/)?.[1];
  if (viewBox === undefined) throw new Error(`viewBox not found: ${markup}`);
  return { viewBox, body: markup.replace(/^<svg[^>]*>|<\/svg>$/g, '') };
}

/**
 * MUI のアイコンからショートカット用の SVG を組み立てる。アプリのアイコンと同じ角丸の板の中央に、
 * 白い絵を 64 分の 32 の大きさで置く。ランチャーが丸く切り抜いても（安全領域は中央 80%）絵は欠けない。
 */
function shortcutSvg(Icon: ComponentType): string {
  const { viewBox, body } = glyphOf(Icon);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${BRAND}"/>
  <svg x="16" y="16" width="32" height="32" viewBox="${viewBox}" fill="#fff">${body}</svg>
</svg>`;
}

/** 記録ボタン（AtomS3R）の画面の一辺の画素数 */
const BUTTON_SCREEN_SIZE = 128;

/**
 * 記録ボタンの画面に出すアイコンを、1 画素 4 ビットの明るさ（上位 4 ビットが左の画素）にする。
 * M5GFX の pushGrayscaleImage（grayscale_4bit）にそのまま渡せる形で、
 * 明るさを前景色と背景色の混ぜ具合として塗るので、送れなかったときは同じ絵を灰色で出せる。
 * 画面いっぱいに描く（MUI のアイコンは絵の周りに余白を持っているので、縁には触れない）。
 * WHY NOT 8 ビット: 輪郭のなめらかさには 16 段で足り、8 ビットにしてもフラッシュを倍使うだけになる。
 */
async function renderButtonIcon(Icon: ComponentType): Promise<Uint8Array> {
  const { viewBox, body } = glyphOf(Icon);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${BUTTON_SCREEN_SIZE}" height="${BUTTON_SCREEN_SIZE}" viewBox="${viewBox}" fill="#fff">${body}</svg>`;
  const page = await browser.newPage();
  // ブラウザの中で描いて画素を読む。scripts/ は DOM の型を持たない設定で型検査するので、ここだけ文字列で渡す
  const levels = await page.evaluate<number[]>(`(async () => {
    const image = new Image();
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svg)});
    await image.decode();
    const context = new OffscreenCanvas(${BUTTON_SCREEN_SIZE}, ${BUTTON_SCREEN_SIZE}).getContext('2d');
    context.fillStyle = '#000';
    context.fillRect(0, 0, ${BUTTON_SCREEN_SIZE}, ${BUTTON_SCREEN_SIZE});
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, ${BUTTON_SCREEN_SIZE}, ${BUTTON_SCREEN_SIZE});
    // 白黒なので R だけ見ればよい。0〜255 を 0〜15 にする
    return Array.from({ length: ${BUTTON_SCREEN_SIZE ** 2} }, (_, i) => Math.round(data[i * 4] / 17));
  })()`);
  await page.close();
  const packed = new Uint8Array(levels.length / 2);
  for (let i = 0; i < packed.length; ++i) {
    packed[i] = ((levels[i * 2] ?? 0) << 4) | (levels[i * 2 + 1] ?? 0);
  }
  return packed;
}

/** 記録ボタンのアイコンを C++ のヘッダーに書き出す。行ごとに 1 行にして、差分で絵の変化を追えるようにする */
function buttonIconsHeader(icons: Record<string, Uint8Array>): string {
  const rowBytes = BUTTON_SCREEN_SIZE / 2;
  const arrays = Object.entries(icons).map(([name, data]) => {
    const rows = Array.from({ length: BUTTON_SCREEN_SIZE }, (_, y) =>
      Array.from(
        data.subarray(y * rowBytes, (y + 1) * rowBytes),
        (b) => `0x${b.toString(16).padStart(2, '0')}`,
      ).join(','),
    );
    return `constexpr uint8_t ${name}[] = {\n${rows.map((row) => `  ${row},`).join('\n')}\n};`;
  });
  return `#pragma once

// scripts/generate-icons.ts が生成する（pnpm icons:generate）。手で書き換えない。
// アプリのレモンの画面と同じアイコン（src/features/lemon/care-type-icons.tsx）を
// ${BUTTON_SCREEN_SIZE}×${BUTTON_SCREEN_SIZE} 画素、1 画素 4 ビットの明るさにしたもの（上位 4 ビットが左の画素）。

#include <stdint.h>

namespace icons {

constexpr int SIZE = ${BUTTON_SCREEN_SIZE};

${arrays.join('\n\n')}

}  // namespace icons
`;
}

mkdirSync('public/icons', { recursive: true });
await render(icon, 192, 0, 'public/icons/icon-192.png');
await render(icon, 512, 0, 'public/icons/icon-512.png');
await render(icon, 180, 0, 'public/icons/apple-touch-icon.png');
// maskable は安全領域（中央 80%）に収まるよう余白を取る
await render(icon, 512, 64, 'public/icons/icon-maskable-512.png');
await render(badge, 96, 0, 'public/icons/badge-96.png');
for (const { kind } of SHORTCUTS) {
  // 絵はアプリの中で同じ場所へ行く物（下部ナビ）・同じ物を追加する操作（追加ボタン）から取る
  const Icon = kind === 'calendar' ? calendarNavItem.icon : ADD_KINDS[kind].icon;
  await render(shortcutSvg(Icon), 192, 0, `public${shortcutIconSrc(kind)}`);
}
writeFileSync(
  'iot/lemon-record-button/icons.h',
  buttonIconsHeader({
    MIST: await renderButtonIcon(CARE_TYPE_ICONS.mist),
    WATER: await renderButtonIcon(CARE_TYPE_ICONS.water),
  }),
);
await browser.close();
console.log('icons generated');
