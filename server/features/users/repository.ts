import { and, asc, eq } from 'drizzle-orm';
import type { UpdateUserInput } from '../../../shared/validation/users.ts';
import { db, runBatch } from '../../lib/db/client.ts';
import { oauthAccessTokens, oauthClients, oauthRefreshTokens } from '../../lib/db/oauth-schema.ts';
import { mcpEventSubscriptions } from '../mcp-events/schema.ts';
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

/**
 * 共有プロフィール（名前・色・通知時刻）を変え、passwordHash があればパスワードも置き換えて、
 * そのユーザーの全端末のセッションと、MCP クライアントに渡したアクセスを止める。
 * 変えた後の行を返す（ユーザーがいなければ undefined）。
 *
 * すべてを 1 回の原子的な操作で行う。パスワードの置き換えとセッションの失効は片方だけ通ると困り
 * （新しいパスワードなのに古い端末が使える）、プロフィールと分けると「名前は変わったのにパスワードは
 * 変わらない」が起こる。存在の確認も読み直しも別の往復にせず、更新の returning で済ませる。
 * パスワードハッシュは better-auth の規約どおり accounts（provider_id = 'credential'）に置く。
 * セッション行は OAuth の参照のため消さずに期限切れにする。
 *
 * MCP クライアントに渡したアクセス（リフレッシュトークン・不透明なアクセストークン・MCP Events の購読）は、
 * パスワードを変えても残るので消す（何を消し、何を消さないかの理由は docs/features/users.md の「認証」）。
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
          tx.delete(oauthAccessTokens).where(eq(oauthAccessTokens.userId, id)),
          tx.delete(oauthRefreshTokens).where(eq(oauthRefreshTokens.userId, id)),
          tx.delete(mcpEventSubscriptions).where(eq(mcpEventSubscriptions.userId, id)),
        ]),
  ]);
  return updated[0];
}
