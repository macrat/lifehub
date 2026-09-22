import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

/**
 * PWA 用の PNG を生成する。元は 2 つの SVG:
 * - `public/icons/favicon.svg` → アプリのアイコン（192 / 512 / maskable 512 / apple-touch 180）
 * - `public/icons/badge.svg` → 通知の小さな印（96）。Android はこれを alpha だけの単色として
 *   ステータスバーに出すので、背景の板を持たない字だけの形にしてある。
 *
 * 画像ライブラリを増やさず、開発依存に既にある Playwright の Chromium でラスタライズする。
 * アイコンを変えたときだけ実行し、生成物はコミットする。
 */
const icon = readFileSync('public/icons/favicon.svg', 'utf8');
const badge = readFileSync('public/icons/badge.svg', 'utf8');

async function render(svg: string, size: number, padding: number, file: string): Promise<void> {
  // maskable（余白あり）は背景を塗りつぶし、それ以外は SVG の角丸を活かすため背景を透過にする
  const background = padding > 0 ? '#A0148C' : 'transparent';
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  const inner = size - padding * 2;
  await page.setContent(
    `<body style="margin:0;background:${background}"><div style="position:absolute;inset:${padding}px;width:${inner}px;height:${inner}px">${svg}</div></body>`,
  );
  await page.locator('body').screenshot({ path: file, omitBackground: padding === 0 });
  await browser.close();
}

mkdirSync('public/icons', { recursive: true });
await render(icon, 192, 0, 'public/icons/icon-192.png');
await render(icon, 512, 0, 'public/icons/icon-512.png');
await render(icon, 180, 0, 'public/icons/apple-touch-icon.png');
// maskable は安全領域（中央 80%）に収まるよう余白を取る
await render(icon, 512, 64, 'public/icons/icon-maskable-512.png');
await render(badge, 96, 0, 'public/icons/badge-96.png');
console.log('icons generated');
