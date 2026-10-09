import { NotFoundError } from '../../lib/errors.ts';
import * as repository from './repository.ts';

/** 画面に出す、接続を許可した MCP クライアント */
export type McpClient = {
  /** 許可（同意）の id。失効に使う */
  id: string;
  /** クライアントが名乗る名前（無ければ配布元のホスト）。名前は自由に名乗れるので、見分けには site を使う */
  name: string;
  /** クライアント ID（メタデータ文書の URL）のホスト。クライアントの配布元 */
  site: string;
  /** 最後に許可した日時 */
  authorizedAt: string;
};

export async function listClients(userId: string): Promise<McpClient[]> {
  return (await repository.findByUser(userId)).map((row) => {
    const site = hostOf(row.clientId);
    return { id: row.id, name: row.name || site, site, authorizedAt: row.updatedAt.toISOString() };
  });
}

/**
 * 許可を取り消す。そのクライアントは、そのユーザーとしては何もできなくなり、張っていた MCP Events の購読も消える。
 * 他のユーザーの許可は消せない
 */
export async function revokeClient(id: string, userId: string): Promise<void> {
  if (!(await repository.remove(id, userId))) {
    throw new NotFoundError('MCP クライアントが見つかりません');
  }
}

/**
 * アクセストークンの発行のもとになった許可（同意の id）が、そのユーザーのそのクライアントへの許可として今もあるか。
 * MCP の要求ごとに確かめ、失効をその場で効かせる（アクセストークンは JWT で DB を見ずに検証するので、確かめなければ
 * 期限まで使えてしまう）。失効した後に許可し直しても同意の id が変わるので、失効した許可のトークンは通さない。
 */
export function isAuthorized(
  consentId: string,
  userId: string,
  clientId: string,
): Promise<boolean> {
  return repository.existsConsent(consentId, userId, clientId);
}

/** クライアント ID は CIMD のメタデータ文書の URL（cimd だけを受け付ける。docs/features/mcp.md）。URL でなければそのまま */
function hostOf(clientId: string): string {
  return URL.parse(clientId)?.host || clientId;
}
