import { and, asc, eq } from 'drizzle-orm';
import type { UpdateUserInput } from '../../../shared/validation/users.ts';
import { db, runBatch } from '../../lib/db/client.ts';
import { oauthClients } from '../../lib/db/oauth-schema.ts';
import { accounts, sessions, users } from './schema.ts';

export type UserRow = { id: string; name: string; email: string; hue: number };

const publicColumns = { id: users.id, name: users.name, email: users.email, hue: users.hue };

export async function findAll(): Promise<UserRow[]> {
  return db.select(publicColumns).from(users).orderBy(asc(users.createdAt));
}

/** 全ユーザーの終日の予定・タスクの通知時刻（ユーザー ID → その日の 0:00 からの分） */
export async function findAllDayNotifyMinutes(): Promise<Map<string, number>> {
  const rows = await db.select({ id: users.id, minutes: users.allDayNotifyMinutes }).from(users);
  return new Map(rows.map((row) => [row.id, row.minutes]));
}

/** OAuth クライアント（MCP クライアント）の名前。登録の client_name で、無ければ null */
export async function findOAuthClientName(clientId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: oauthClients.name })
    .from(oauthClients)
    .where(eq(oauthClients.clientId, clientId));
  return row?.name ?? null;
}

export async function findByEmail(email: string): Promise<UserRow | undefined> {
  const rows = await db.select(publicColumns).from(users).where(eq(users.email, email)).limit(1);
  return rows[0];
}

/** 共有プロフィール（名前・色・通知時刻）を変える。変えた後の行を返す（ユーザーがいなければ undefined） */
export async function update(id: string, profile: UpdateUserInput): Promise<UserRow | undefined> {
  const [updated] = await db
    .update(users)
    .set({ ...profile, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning(publicColumns);
  return updated;
}

/**
 * パスワードを置き換え、そのユーザーの全端末のセッションを失効させる。
 * 2 つを 1 回の原子的な操作で行う（片方だけ通ると、新しいパスワードなのに古い端末が使えてしまう）。
 * パスワードハッシュは better-auth の規約どおり accounts（provider_id = 'credential'）に置く。
 * セッション行は OAuth の参照のため消さずに期限切れにする。
 */
export async function replacePassword(id: string, passwordHash: string): Promise<void> {
  await runBatch((tx) => [
    tx
      .update(accounts)
      .set({ password: passwordHash })
      .where(and(eq(accounts.userId, id), eq(accounts.providerId, 'credential'))),
    tx.update(sessions).set({ expiresAt: new Date() }).where(eq(sessions.userId, id)),
  ]);
}
