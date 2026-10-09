import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHROMIUM_PACK } from '../moneyforward.ts';

describe('Vercel で動かす Chromium', () => {
  it('アーカイブの版は入っている @sparticuz/chromium-min と同じ', () => {
    // 依存だけを上げると、JS とアーカイブの版が食い違う。URL と SHA-256 を替えるまでここで落とす。
    // package.json は exports に無いので、import せずにファイルとして読む
    const { version } = JSON.parse(
      readFileSync('node_modules/@sparticuz/chromium-min/package.json', 'utf8'),
    );
    expect(CHROMIUM_PACK.url).toContain(`/v${version}/chromium-v${version}-pack.x64.tar`);
  });
});
