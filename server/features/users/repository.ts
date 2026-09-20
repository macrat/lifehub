import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../lib/db.ts';
import { accounts, users } from './schema.ts';

export type UserRow = { id: string; name: string; email: string };

const publicColumns = { id: users.id, name: users.name, email: users.email };

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

export async function updateName(id: string, name: string): Promise<void> {
  await db.update(users).set({ name }).where(eq(users.id, id));
}

/** パスワードハッシュは better-auth の規約どおり accounts（provider_id = 'credential'）に置く */
export async function updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
  await db
    .update(accounts)
    .set({ password: passwordHash })
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'credential')));
}
