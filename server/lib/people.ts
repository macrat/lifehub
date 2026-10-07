import type { Actor } from './actor.ts';

/**
 * 記録に出す人と、ID・書いた人を名前にする規則。MCP の出力・MCP Events・プッシュ通知が同じ名前の出し方を使う。
 * ユーザーの一覧そのものは users の feature が読む（`server/features/users/people.ts` の `listPeople`）。
 */
export type Person = { id: string; name: string };

/** ID を名前にする。いない人（消されたユーザー）は ID のまま */
export function nameOf(people: Person[], id: string): string {
  return people.find((p) => p.id === id)?.name ?? id;
}

/** 記録を書いた人の名前。API キーで入れた記録は人が分からないので、キーの名前で表す */
export function authorName(people: Person[], author: Actor): string {
  return 'userId' in author ? nameOf(people, author.userId) : `API キー「${author.apiKeyName}」`;
}
