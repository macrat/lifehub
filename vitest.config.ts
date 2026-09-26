import { defineConfig } from 'vitest/config';
import { buildInfoDefine } from './build-info.ts';

/**
 * クライアント（jsdom）・共有（Node）・サーバー（Node + compose.yaml の Postgres）を別プロジェクトとして実行する。
 * サーバーのテストは実 DB に対して行い、モックは使わない。
 * shared/ のテストは DB もサーバーの環境変数も使わないので、サーバーと分けて並べて走らせる
 * （分けておくと、shared/ がサーバーの環境に頼り始めたときにここで落ちて気づける）。
 *
 * どのプロジェクトも `isolate: false` で、同じワーカーのテストファイルは読み込んだモジュールと
 * 環境（jsdom）を使い回す。WHY: ファイルごとに作り直すと、サーバーは Hono・better-auth・MCP SDK を、
 * クライアントは jsdom を毎回用意し直すことになり、テストそのものより長くかかる（全体で数倍）。
 * そのぶん、テストはモジュールの状態を持ち越さないように後片付けする（`vi.restoreAllMocks`・
 * `vi.unstubAllGlobals`・`queryClient.clear()` など）。環境変数で作り直す必要のあるテストは
 * `vi.resetModules` で作り直す（`server/__tests__/auth-origin.test.ts`）。
 */
export default defineConfig({
  define: buildInfoDefine,
  test: {
    projects: [
      {
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          isolate: false,
        },
      },
      {
        test: {
          name: 'shared',
          environment: 'node',
          include: ['shared/**/*.test.ts'],
          isolate: false,
        },
      },
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/**/*.test.ts'],
          setupFiles: ['./server/test-setup.ts'],
          isolate: false,
          // 全テストが同じ DB を共有するため、ファイル間の並列実行は行わない。
          // 並列度の違うプロジェクトは同じ組で走らせられないので、client・shared の後に回す
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
