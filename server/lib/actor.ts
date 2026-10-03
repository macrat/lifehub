/**
 * 記録を書いた人。画面・MCP からなら書いた人、API キーからならそのキーの名前。
 * API キーで入れた記録は誰が書いたか分からない（キーを持つボタンは家の誰が押しても同じキーで送る）ので、
 * 人の代わりにキーの名前を残す
 */
export type Actor = { userId: string } | { apiKeyName: string };
