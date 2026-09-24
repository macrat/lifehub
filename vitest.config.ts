import { defineConfig } from 'vitest/config';
import { buildInfoDefine } from './build-info.ts';

/**
 * クライアント（jsdom）・共有（Node）・サーバー（Node + compose.yaml の Postgres）を別プロジェクトとして実行する。
 * サーバーのテストは実 DB に対して行い、モックは使わない。
 * shared/ のテストは DB もサーバーの環境変数も使わないので、サーバーと分けて並べて走らせる
 * （分けておくと、shared/ がサーバーの環境に頼り始めたときにここで落ちて気づける）。
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
          setupFiles: ['./src/test-setup.ts'],
        },
      },
      {
        test: {
          name: 'shared',
          environment: 'node',
          include: ['shared/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/**/*.test.ts'],
          setupFiles: ['./server/test-setup.ts'],
          // 全テストが同じ DB を共有するため、ファイル間の並列実行は行わない。
          fileParallelism: false,
        },
      },
    ],
  },
});
