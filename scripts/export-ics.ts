import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { renderAllIcs } from '../server/features/calendar-feeds/service.ts';

/**
 * `DATABASE_URL` の DB にある全員の全予定を ics に書き出す。何を出すかは `renderAllIcs` を参照。
 * LifeHub が使えなくなったときに、他のカレンダーアプリへ取り込んで予定を見るためのもの。
 * 毎日のバックアップ（`.github/workflows/backup.yml`）もこれを使う。
 *
 *   pnpm calendar:export calendar.ics
 */
const { positionals } = parseArgs({ allowPositionals: true });
const [file] = positionals;
if (!file) {
  console.error('usage: pnpm calendar:export <出力ファイル>');
  process.exit(1);
}

await writeFile(file, await renderAllIcs());
process.exit(0);
