import { and, asc, eq } from 'drizzle-orm';
import type { UpdateUserInput } from '../../../shared/validation/users.ts';
import { db, runBatch } from '../../lib/db/client.ts';
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

/**
 * 共有プロフィール（名前・色・通知時刻）を変え、passwordHash があればパスワードも置き換えて、
 * そのユーザーの全端末のセッションを失効させる。変えた後の行を返す（ユーザーがいなければ undefined）。
 *
 * すべてを 1 回の原子的な操作で行う。パスワードの置き換えとセッションの失効は片方だけ通ると困り
 * （新しいパスワードなのに古い端末が使える）、プロフィールと分けると「名前は変わったのにパスワードは
 * 変わらない」が起こる。存在の確認も読み直しも別の往復にせず、更新の returning で済ませる。
 * パスワードハッシュは better-auth の規約どおり accounts（provider_id = 'credential'）に置く。
 * セッション行は OAuth の参照のため消さずに期限切れにする。
 */
export async function update(
  id: string,
  profile: Omit<UpdateUserInput, 'password'>,
  passwordHash?: string,
): Promise<UserRow | undefined> {
  const [updated] = await runBatch((tx) => [
    // updatedAt を必ず含めるので、パスワードだけの変更でも更新文が空にならず、存在を returning で確かめられる
    tx
      .update(users)
      .set({ ...profile, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning(publicColumns),
    ...(passwordHash === undefined
      ? []
      : [
          tx.update(sessions).set({ expiresAt: new Date() }).where(eq(sessions.userId, id)),
          tx
            .update(accounts)
            .set({ password: passwordHash })
            .where(and(eq(accounts.userId, id), eq(accounts.providerId, 'credential'))),
        ]),
  ]);
  return updated[0];
}
