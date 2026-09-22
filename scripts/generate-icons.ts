import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { type ComponentType, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ADD_KINDS } from '../src/features/add/kinds.ts';
import { SHORTCUTS, shortcutIconSrc } from '../src/lib/shortcuts.ts';
import { calendarNavItem } from '../src/lib/ui/navigation.ts';

/**
 * PWA 用の PNG を生成する。元は `public/icons/` の SVG（アプリのアイコンと通知の印）と、
 * アプリが使っている MUI のアイコン（ショートカット）。
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
 * MUI のアイコンからショートカット用の SVG を組み立てる。アプリのアイコンと同じ角丸の板の中央に、
 * 白い絵を 64 分の 32 の大きさで置く。ランチャーが丸く切り抜いても（安全領域は中央 80%）絵は欠けない。
 * 絵は React コンポーネントをそのまま描き出して使うので、path をここへ書き写して二重に持たない。
 */
function shortcutSvg(Icon: ComponentType): string {
  // MUI が返すのは emotion の <style> と <svg viewBox="0 0 24 24">。どちらも剥がして中身（path）にする
  const glyph = renderToStaticMarkup(createElement(Icon))
    .replace(/^<style[\s\S]*?<\/style>/, '')
    .replace(/^<svg[^>]*>|<\/svg>$/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${BRAND}"/>
  <svg x="16" y="16" width="32" height="32" viewBox="0 0 24 24" fill="#fff">${glyph}</svg>
</svg>`;
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
await browser.close();
console.log('icons generated');
