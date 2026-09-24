import { spawnSync } from 'node:child_process';

/**
 * `DATABASE_URL` の DB を、スキーマもデータもまるごと 1 つの SQL ファイルに書き出す。
 * 書き出したものは `pnpm db:restore` で別の DB（ローカルの Postgres、Neon の dev ブランチ）に入れられる。
 * 毎日のバックアップ（`.github/workflows/backup.yml`）もこれを使う。
 *
 *   pnpm db:dump backup.sql
 *
 * ダンプは Postgres 標準の `pg_dump` に任せる。本番（Neon）と同じメジャーバージョン以上の
 * クライアントが要る（古い `pg_dump` は新しいサーバーを読めない）。
 *
 * 形式はプレーンな SQL にする。中身をそのまま読んで確かめられ、`psql` だけで戻せるため。
 * カスタム形式（`-Fc`）の部分的な復元は、この規模の DB では要らない。
 *
 * - `--clean --if-exists`: 復元先に同じテーブルがあれば消してから作る。マイグレーション済みの
 *   DB にもそのまま重ねられる（空の DB を用意し直さずに済む）。
 * - `--no-owner --no-privileges`: 所有者と権限を書かない。本番のロール（`lifehub`）が無い
 *   ローカルの DB にも、そのロールを作らずに戻せる。
 * - マイグレーションの記録（`drizzle` スキーマ）も含む。戻した DB はダンプ元と同じところまで
 *   マイグレーション済みとして扱われ、以降の `pnpm db:migrate` が差分だけを当てる。
 */
const file = process.argv[2];
const url = process.env.DATABASE_URL;
if (!file || !url) {
  console.error('usage: DATABASE_URL=<接続文字列> pnpm db:dump <出力ファイル>');
  process.exit(1);
}

const { status } = spawnSync(
  'pg_dump',
  ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--file', file, '--dbname', url],
  { stdio: 'inherit' },
);
process.exit(status ?? 1);
