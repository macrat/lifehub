import { and, asc, eq } from 'drizzle-orm';
import { db, runBatch } from '../../lib/db.ts';
import { accounts, sessions, users } from './schema.ts';

export type UserRow = { id: string; name: string; email: string; hue: number };

const publicColumns = { id: users.id, name: users.name, email: users.email, hue: users.hue };

export async function findAll(): Promise<UserRow[]> {
  return db.select(publicColumns).from(users).orderBy(asc(users.createdAt));
}

export async function findById(id: string): Promise<UserRow | undefined> {
  const rows = await db.select(publicColumns).from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
}

export async function findByEmail(email: string): Promise<UserRow | undefined> {
  const rows = await db.select(publicColumns).from(users).where(eq(users.email, email)).limit(1);
  return rows[0];
}

/** 終日の予定・タスクの通知時刻（ユーザー ID → その日の 0:00 からの分） */
export async function findAllDayNotifyMinutes(): Promise<Map<string, number>> {
  const rows = await db.select({ id: users.id, minutes: users.allDayNotifyMinutes }).from(users);
  return new Map(rows.map((row) => [row.id, row.minutes]));
}

export async function updateProfile(
  id: string,
  values: { name?: string; hue?: number; allDayNotifyMinutes?: number },
): Promise<void> {
  await db.update(users).set(values).where(eq(users.id, id));
}

/** パスワードハッシュは better-auth の規約どおり accounts（provider_id = 'credential'）に置く */
export async function updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
  // パスワードを変更したユーザーの全端末を失効させる。セッション行は OAuth の参照のため残す。
  await runBatch((tx) => [
    tx.update(sessions).set({ expiresAt: new Date() }).where(eq(sessions.userId, userId)),
    tx
      .update(accounts)
      .set({ password: passwordHash })
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'credential'))),
  ]);
}
