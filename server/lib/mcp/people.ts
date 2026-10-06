import { z } from 'zod';
import { ValidationError } from '../errors.ts';
import type { Person } from '../people.ts';

/**
 * 人の指定。LLM には ID ではなく名前（か "me"）で指させ、出力にも名前を出す。
 * WHY: 利用者は 2 人だけで、会話の中の人は名前で出てくる。UUID を覚えて写させると取り違えやすく、
 * 読む側も誰のことか分からない。同じ名前の人がいるときのために ID も受ける。
 */
export const personInputSchema = z
  .string()
  .trim()
  .min(1)
  .describe('人の名前（get_overview の users）。自分なら "me"');

/** 人の指定を ID にする。当てはまらなければ、選べる名前を文で返す */
export function resolvePerson(people: Person[], value: string, me: string): string {
  if (value === 'me') return me;
  const byId = people.find((p) => p.id === value);
  if (byId) return byId.id;
  const byName = people.filter((p) => p.name.toLowerCase() === value.toLowerCase());
  const [only] = byName;
  if (only && byName.length === 1) return only.id;
  const choices = people.map((p) => `"${p.name}"`).join(' / ');
  throw new ValidationError(
    byName.length > 1
      ? `「${value}」という名前の人が複数います。get_overview の users の id で指定してください`
      : `「${value}」という人はいません。${choices} か "me" で指定してください`,
  );
}
