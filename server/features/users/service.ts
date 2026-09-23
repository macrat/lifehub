import { hashPassword } from 'better-auth/crypto';
import { pickDistinctHue } from '../../../shared/color.ts';
import type { CreateUserInput, UpdateUserInput } from '../../../shared/validation/users.ts';
import { auth } from '../../lib/auth.ts';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.ts';
import { enqueueUpcoming } from '../../lib/notifications/service.ts';
import * as repository from './repository.ts';

export async function listUsers() {
  return repository.findAll();
}

/** 全ユーザーの終日の予定・タスクの通知時刻（ユーザー ID → その日の 0:00 からの分）。通知の列挙と再検証が読む */
export async function getAllDayNotifyMinutes(): Promise<Map<string, number>> {
  return repository.findAllDayNotifyMinutes();
}

/** 外に出すユーザーの形（better-auth のセッションが持つユーザーからも作れる） */
function toPublicUser(user: repository.UserRow): repository.UserRow {
  return { id: user.id, name: user.name, email: user.email, hue: user.hue };
}

/** ログイン中のユーザー（/api/me）。公開の形に、本人だけが使う設定を足す */
export function toMe(user: repository.UserRow & { allDayNotifyMinutes: number }) {
  return { ...toPublicUser(user), allDayNotifyMinutes: user.allDayNotifyMinutes };
}

async function getUser(id: string) {
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

/**
 * ユーザーを変更する。actorId は変更する人（ログイン中のユーザー）。
 * 名前・色・通知時刻は家族で管理する共有プロフィールなので誰でも変えられるが、パスワードは本人だけが変えられる。
 * これが無いと、片方のセッションを得た攻撃者がもう片方のパスワードも奪える。
 */
export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actorId: string,
): Promise<repository.UserRow> {
  if (input.password !== undefined && id !== actorId) {
    throw new ForbiddenError('他のユーザーのパスワードは変更できません');
  }
  await getUser(id);
  const { password, ...profile } = input;
  if (Object.values(profile).some((value) => value !== undefined)) {
    await repository.updateProfile(id, profile);
  }
  if (password !== undefined) {
    await repository.replacePasswordAndRevokeSessions(id, await hashPassword(password));
  }
  // 通知時刻が変われば終日の項目の配信予定時刻も変わるので、当日〜翌日の分をその場で予約し直す
  // （古い時刻の予約は配信時の再検証で捨てられる）
  if (input.allDayNotifyMinutes !== undefined) await enqueueUpcoming();
  return getUser(id);
}
