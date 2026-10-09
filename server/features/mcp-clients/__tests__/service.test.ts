import { eq } from 'drizzle-orm';
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

/** 行を「人 クライアント」の並びにする */
function labels(rows: { userId: string | null; clientId: string }[]): string[] {
  return rows.map((row) => `${row.userId === userId ? 'me' : 'partner'} ${row.clientId}`).sort();
}

/** その表に残っている行の「人 クライアント」 */
async function remaining(
  table: typeof oauthConsents | typeof oauthRefreshTokens | typeof oauthAccessTokens,
): Promise<string[]> {
  const rows = await db.select({ userId: table.userId, clientId: table.clientId }).from(table);
  return labels(rows);
}

/** 残っている MCP Events の購読の「人 クライアント」 */
async function remainingSubscriptions(): Promise<string[]> {
  const rows = await db
    .select({ userId: mcpEventSubscriptions.userId, clientId: oauthConsents.clientId })
    .from(mcpEventSubscriptions)
    .innerJoin(oauthConsents, eq(oauthConsents.id, mcpEventSubscriptions.consentId));
  return labels(rows);
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
    const { consentId: claude } = await authorizeClient(userId, CLAUDE);
    const { consentId: other } = await authorizeClient(userId, OTHER);
    const { consentId: partners } = await authorizeClient(partnerId, CLAUDE);

    await revokeClient(claude, userId);

    const kept = [`me ${OTHER}`, `partner ${CLAUDE}`];
    for (const table of [oauthConsents, oauthRefreshTokens, oauthAccessTokens]) {
      expect(await remaining(table)).toEqual(kept);
    }
    expect(await remainingSubscriptions()).toEqual(kept);
    expect(await isAuthorized(claude)).toBe(false);
    expect(await isAuthorized(other)).toBe(true);
    expect(await isAuthorized(partners)).toBe(true);
  });

  it('他のユーザーの許可と、無い許可は失効できない', async () => {
    const { consentId: partners } = await authorizeClient(partnerId, CLAUDE);

    await expect(revokeClient(partners, userId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(revokeClient(newId(), userId)).rejects.toBeInstanceOf(NotFoundError);
    expect(await isAuthorized(partners)).toBe(true);
  });
});
