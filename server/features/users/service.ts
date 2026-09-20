import { hashPassword } from 'better-auth/crypto';
import { pickDistinctHue } from '../../../shared/color.ts';
import type { CreateUserInput, UpdateUserInput } from '../../../shared/validation/users.ts';
import { auth } from '../../lib/auth.ts';
import { ConflictError, NotFoundError } from '../../lib/errors.ts';
import * as repository from './repository.ts';

export async function listUsers() {
  return repository.findAll();
}

export async function getUser(id: string) {
  const user = await repository.findById(id);
  if (!user) throw new NotFoundError('ユーザーが見つかりません');
  return user;
}

/**
 * ユーザーを作る。パスワードのハッシュは better-auth に任せる。
 * 公開のサインアップ経路は閉じているので、この関数と scripts/create-user.ts だけが作成経路になる。
 * メールの重複は事前に確認する（autoSignIn を切った better-auth は列挙対策として重複時も成功を装うため）。
 */
export async function createUser(input: CreateUserInput): Promise<repository.UserRow> {
  if (await repository.findByEmail(input.email)) {
    throw new ConflictError('このメールアドレスは既に登録されています');
  }
  const { hue, ...credentials } = input;
  const result = await auth.api.signUpEmail({ body: credentials });
  // 色は better-auth の外側の属性なので、作成後に自前で更新する。指定が無ければ既存のユーザーと離れた色相にする
  const existing = await repository.findAll();
  const resolvedHue =
    hue ?? pickDistinctHue(existing.filter((u) => u.id !== result.user.id).map((u) => u.hue));
  await repository.updateProfile(result.user.id, { hue: resolvedHue });
  return getUser(result.user.id);
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<repository.UserRow> {
  await getUser(id);
  if (input.name !== undefined || input.hue !== undefined) {
    await repository.updateProfile(id, { name: input.name, hue: input.hue });
  }
  if (input.password !== undefined) {
    await repository.updatePasswordHash(id, await hashPassword(input.password));
  }
  return getUser(id);
}
