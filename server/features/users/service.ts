import { hashPassword } from 'better-auth/crypto';
import type { CreateUserInput, UpdateUserInput } from '../../../shared/validation/users.ts';
import { auth } from '../../lib/auth.ts';
import { ConflictError, NotFoundError } from '../../lib/errors.ts';
import * as repository from './repository.ts';

export type { UserRow } from './repository.ts';

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
  const result = await auth.api.signUpEmail({ body: input });
  return { id: result.user.id, name: result.user.name, email: result.user.email };
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<repository.UserRow> {
  await getUser(id);
  if (input.name !== undefined) {
    await repository.updateName(id, input.name);
  }
  if (input.password !== undefined) {
    await repository.updatePasswordHash(id, await hashPassword(input.password));
  }
  return getUser(id);
}
