import { beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../../../../shared/id.ts';
import { db } from '../../../lib/db/client.ts';
import {
  oauthAccessTokens,
  oauthConsents,
  oauthRefreshTokens,
} from '../../../lib/db/oauth-schema.ts';
import { resetUsers } from '../../../lib/db/test-db.ts';
import { NotFoundError } from '../../../lib/errors.ts';
import { mcpEventSubscriptions } from '../../mcp-events/schema.ts';
import { isAuthorized, listClients, revokeClient } from '../service.ts';
import { authorizeClient } from './fixtures.ts';

const CLAUDE = 'https://claude.example.com/oauth/client.json';
const OTHER = 'https://other.example.net/client.json';

let userId: string;
let partnerId: string;

/** 残っている行の (ユーザー, クライアント)。表ごと */
async function remaining() {
  const pairs = async (
    table: typeof oauthConsents | typeof oauthRefreshTokens | typeof oauthAccessTokens,
  ) =>
    (await db.select({ userId: table.userId, clientId: table.clientId }).from(table)).map(
      (row) => `${row.userId === userId ? 'me' : 'partner'} ${row.clientId}`,
    );
  const subscriptions = await db
    .select({ userId: mcpEventSubscriptions.userId, clientId: mcpEventSubscriptions.clientId })
    .from(mcpEventSubscriptions);
  return {
    consents: (await pairs(oauthConsents)).sort(),
    refreshTokens: (await pairs(oauthRefreshTokens)).sort(),
    accessTokens: (await pairs(oauthAccessTokens)).sort(),
    subscriptions: subscriptions
      .map((row) => `${row.userId === userId ? 'me' : 'partner'} ${row.clientId}`)
      .sort(),
  };
}

describe('mcp-clients service', () => {
  beforeEach(async () => {
    ({ userId, partnerId } = await resetUsers());
  });

  it('自分が許可したクライアントだけを、名乗る名前（無ければ配布元のホスト）と配布元のホストで並べる', async () => {
    await authorizeClient(userId, CLAUDE, { name: 'Claude', at: new Date('2026-10-01T00:00:00Z') });
    await authorizeClient(userId, OTHER, { at: new Date('2026-10-02T00:00:00Z') });
    await authorizeClient(partnerId, CLAUDE);

    expect(await listClients(userId)).toEqual([
      {
        id: expect.any(String),
        name: 'Claude',
        site: 'claude.example.com',
        authorizedAt: '2026-10-01T00:00:00.000Z',
      },
      {
        id: expect.any(String),
        name: 'other.example.net',
        site: 'other.example.net',
        authorizedAt: '2026-10-02T00:00:00.000Z',
      },
    ]);
  });

  it('失効すると、そのクライアントの自分の許可・トークン・購読だけが消え、許可していないことになる', async () => {
    await authorizeClient(userId, CLAUDE);
    await authorizeClient(userId, OTHER);
    await authorizeClient(partnerId, CLAUDE);
    const claude = (await listClients(userId)).find(
      (client) => client.site === 'claude.example.com',
    );

    await revokeClient(claude?.id ?? '', userId);

    const kept = [`me ${OTHER}`, `partner ${CLAUDE}`];
    expect(await remaining()).toEqual({
      consents: kept,
      refreshTokens: kept,
      accessTokens: kept,
      subscriptions: kept,
    });
    expect(await isAuthorized(userId, CLAUDE)).toBe(false);
    expect(await isAuthorized(userId, OTHER)).toBe(true);
    expect(await isAuthorized(partnerId, CLAUDE)).toBe(true);
  });

  it('他のユーザーの許可と、無い許可は失効できない', async () => {
    await authorizeClient(partnerId, CLAUDE);
    const [partners] = await listClients(partnerId);

    await expect(revokeClient(partners?.id ?? '', userId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(revokeClient(newId(), userId)).rejects.toBeInstanceOf(NotFoundError);
    expect(await isAuthorized(partnerId, CLAUDE)).toBe(true);
  });
});
