import { defineConfig } from 'vitest/config';
import { buildInfoDefine } from './build-info.ts';

/**
 * クライアント（jsdom）とサーバー（Node + compose.yaml の Postgres）を別プロジェクトとして実行する。
 * サーバーのテストは実 DB に対して行い、モックは使わない。
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
          name: 'server',
          environment: 'node',
          include: ['server/**/*.test.ts', 'shared/**/*.test.ts'],
          setupFiles: ['./server/test-setup.ts'],
          // 全テストが同じ DB を共有するため、ファイル間の並列実行は行わない。
          fileParallelism: false,
        },
      },
    ],
  },
});
