import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { E2E_WORKERS, serverEnv } from './servers.ts';

/** ワーカーごとの DB を、それぞれ別のプロセスで並べて用意する（`prepare-db.ts`） */
export default async function globalSetup() {
  await Promise.all(
    Array.from({ length: E2E_WORKERS }, (_, index) =>
      promisify(execFile)('pnpm', ['exec', 'tsx', 'e2e/prepare-db.ts'], {
        env: { ...process.env, ...serverEnv(index) },
      }),
    ),
  );
}
