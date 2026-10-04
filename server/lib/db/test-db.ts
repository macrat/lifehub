import { getTableName, is, sql } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { pickDistinctHue } from '../../../shared/color.ts';
import { newId } from '../../../shared/id.ts';
import { accounts, users } from '../../features/users/schema.ts';
import { db } from './client.ts';
import * as schema from './schema.ts';

/**
 * スキーマの全テーブルを、参照する側が先になる順に並べる（その順に消せば外部キーに当たらない）。
 * 自分自身への参照（繰り返しの回の行 → 繰り返し元）は、同じ文で一緒に消えるので順序に関わらない。
 */
function deletionOrder(): PgTable[] {
  const tables: PgTable[] = Object.values(schema).filter((value) => is(value, PgTable));
  const referenced = (table: PgTable) =>
    getTableConfig(table)
      .foreignKeys.map((key) => key.reference().foreignTable)
      .filter((target) => target !== table);
  const ordered: PgTable[] = [];
  const visit = (table: PgTable) => {
    if (ordered.includes(table)) return;
    for (const target of referenced(table)) visit(target);
    ordered.push(table);
  };
  for (const table of tables) visit(table);
  // 参照される側から積んだので、逆に並べると参照する側が先になる
  return ordered.reverse();
}

const DELETE_ALL = sql.raw(
  deletionOrder()
    .map((table) => `delete from "${getTableName(table)}"`)
    .join('; '),
);

/**
 * テスト用: スキーマに定義された全テーブルを空にする。マイグレーション管理テーブルは残す。
 * 各テストファイルの beforeEach で呼び、テスト間の独立性を保つ。
 *
 * WHY truncate ではなく delete: truncate は表ごとに固定の手間があり、空に近い表を 25 個空けるのに
 * 60ms ほどかかる。ほぼ全テストの前に呼ぶので、テスト全体では数十秒になる。行の少ない表なら delete は
 * 1ms ほどで済む。全文は 1 回の問い合わせとして送るので、Postgres が 1 つのトランザクションで実行する。
 */
export async function clearTables(): Promise<void> {
  await db.execute(DELETE_ALL);
}

/**
 * テスト用: ユーザーを作って ID を返す。A は自分、B は相手として使う。名前・メール・パスワードそのものを確かめるテストでは使わない。
 *
 * users service の createUser と同じ行（ユーザーと、パスワードを持つ credential の account）を直接書く。
 * WHY createUser を通さない: パスワードのハッシュ（scrypt）は 1 回 100ms ほどかかり、ほぼ全テストの
 * 準備で 2 人ずつ作るとテスト全体の時間の大半を占める。パスワードは全員同じなので、作っておいたハッシュ（`TEST_PASSWORD_HASH`）を書く。
 * 作成の経路そのもの（重複の拒否・色の割り当て・ログインできること）は users service のテストで確かめる。
 */
export async function createTestUser(name: TestUserName): Promise<string> {
  const id = newId();
  const existing = await db.select({ hue: users.hue }).from(users);
  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id,
      name,
      email: testEmail(name),
      hue: pickDistinctHue(existing.map((user) => user.hue)),
    });
    await tx.insert(accounts).values({
      id: newId(),
      accountId: id,
      providerId: 'credential',
      userId: id,
      password: TEST_PASSWORD_HASH,
    });
  });
  return id;
}

type TestUserName = 'A' | 'B';

/**
 * DB を空にして、自分（A）と相手（B）のユーザーを作り直し、その ID を返す。各テストの前に呼ぶ。
 */
export async function resetUsers(): Promise<{ userId: string; partnerId: string }> {
  await clearTables();
  const userId = await createTestUser('A');
  return { userId, partnerId: await createTestUser('B') };
}

/**
 * テスト用のユーザーのパスワード `password-123456` のハッシュ（better-auth の `hashPassword` で作った物）。
 * WHY 定数: テストの中で作るとモジュール変数に持つことになり、環境変数を変えるテストが `vi.resetModules` で
 * モジュールを作り直すたびに作り直し（scrypt）が走る。
 */
const TEST_PASSWORD_HASH =
  '22c0519b69d624ee58aa6dbffd44dfb0:d22765b3756c9cb21aac77fd1cead2e755eb88c4a1250b968ae351cc76a6f5e71c8e213315e825a39078c82ce57af7b8f3a5553975ec510569e5b9e4691233b0';

function testEmail(name: TestUserName): string {
  return `${name.toLowerCase()}@example.com`;
}
