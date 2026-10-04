import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { E2E_WORKERS, serverEnv } from './servers.ts';

const run = promisify(execFile);

/**
 * ワーカーごとの DB を、それぞれ別のプロセスで並べて用意する（`prepare-db.ts`）。
 * pnpm を通さずに Node へ tsx を読み込ませて起動する（pnpm の起動ぶんを待たない）
 */
export default async function globalSetup() {
  await Promise.all(
    Array.from({ length: E2E_WORKERS }, (_, index) =>
      run(process.execPath, ['--import', 'tsx', 'e2e/prepare-db.ts'], {
        env: { ...process.env, ...serverEnv(index) },
      }),
    ),
  );
}
