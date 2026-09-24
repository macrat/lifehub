import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

/**
 * `pnpm db:dump` で書き出した SQL を `DATABASE_URL` の DB に戻す。
 * ダンプに含まれるテーブルは中身ごと置き換わる（ダンプに無いテーブルには触らない）。
 *
 *   pnpm db:restore backup.sql
 *
 * 本番データのクローンを手元に作るとき、バックアップから本番を戻すときに使う。
 * 戻し先を確かめる手順は挟まない。本番に戻すことも正当な使い道で、区別できないため。
 * `DATABASE_URL` がどこを指しているかは実行する人が確かめる。
 *
 * 実行は Postgres 標準の `psql` に任せる。ダンプを作った `pg_dump` と同じメジャーバージョン
 * 以上のクライアントが要る（新しい `pg_dump` の出力には古い `psql` が知らないメタコマンドが入る）。
 *
 * - `--single-transaction` と `ON_ERROR_STOP`: 1 文でも失敗したら全体を取り消す。
 *   途中まで戻った DB は、戻らなかった DB よりも気付きにくく危ない。
 * - `--no-psqlrc`: 実行する人の `~/.psqlrc` の設定で結果が変わらないようにする。
 * - `--output /dev/null`: ダンプ中の `SELECT`（シーケンスの値の設定）の結果を捨てる。エラーは標準エラーに出る。
 */
const { positionals } = parseArgs({ allowPositionals: true });
const [file] = positionals;
const url = process.env.DATABASE_URL;
if (!file || !url) {
  console.error('usage: DATABASE_URL=<接続文字列> pnpm db:restore <ダンプファイル>');
  process.exit(1);
}

const { status } = spawnSync(
  'psql',
  [
    '--no-psqlrc',
    '--quiet',
    '--output',
    '/dev/null',
    '--single-transaction',
    '--set',
    'ON_ERROR_STOP=1',
    '--file',
    file,
    '--dbname',
    url,
  ],
  { stdio: 'inherit' },
);
process.exit(status ?? 1);
