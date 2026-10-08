/**
 * 記録を書いた人。画面・MCP からなら書いた人、API キーからならそのキーの名前。
 * API キーで入れた記録は誰が書いたか分からない（キーを持つボタンは家の誰が押しても同じキーで送る）ので、
 * 人の代わりにキーの名前を残す
 */
export type Actor = { userId: string } | { apiKeyName: string };

/** 記録の書いた人の列。書いた人（createdBy）か API キーの名前（apiKeyName）のどちらか一方だけを持つ */
type ActorColumns = { createdBy: string | null; apiKeyName: string | null };

/** 記録の列から書いた人を読む（どちらか一方だけを持つことは DB の CHECK 制約が守る） */
export function actorOf({ createdBy, apiKeyName }: ActorColumns): Actor {
  if (createdBy !== null) return { userId: createdBy };
  if (apiKeyName !== null) return { apiKeyName };
  throw new Error('record without an author');
}

/** 書いた人を記録の列にする */
export function actorColumns(actor: Actor): ActorColumns {
  return 'userId' in actor
    ? { createdBy: actor.userId, apiKeyName: null }
    : { createdBy: null, apiKeyName: actor.apiKeyName };
}
