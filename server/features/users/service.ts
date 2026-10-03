import { hashPassword } from 'better-auth/crypto';
import { pickDistinctHue } from '../../../shared/color.ts';
import type { CreateUserInput, UpdateUserInput } from '../../../shared/validation/users.ts';
import { getAuth } from '../../lib/auth.ts';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.ts';
import { scheduleUpcoming } from '../notifications/service.ts';
import * as repository from './repository.ts';

export async function listUsers() {
  return repository.findAll();
}

/**
 * MCP クライアントの名前（OAuth クライアントの登録の client_name）。名前を登録しないクライアントは "MCP" にする。
 * WHY NOT MCP の initialize の clientInfo.name: MCP サーバーはステートレスで、ツールを呼ぶ要求には
 * initialize の内容が届かない。アクセストークンはどの要求にも付き、どのクライアントに出したか（azp）を持つ。
 */
export async function getOAuthClientName(clientId: string): Promise<string> {
  return (await repository.findOAuthClientName(clientId)) ?? 'MCP';
}

/** 外に出すユーザーの形（better-auth のセッションが持つユーザーからも作れる） */
function toPublicUser(user: repository.UserRow): repository.UserRow {
  return { id: user.id, name: user.name, email: user.email, hue: user.hue };
}

/**
 * ログイン中のユーザーとユーザーの一覧（/api/me）。本人は公開の形に本人だけが使う設定を足したもの。
 * 本人はセッションの検証で読んだユーザーをそのまま使う（hue と通知時刻も載っている。server/lib/auth.ts）。
 * WHY 一覧も載せる: 名前と色を出す所は本人（先頭に並べる・自分の色）と一覧を必ず一緒に読むので、
 * 別々に問い合わせると起動のたびに 2 本になる。一覧は 2 人分だけで小さい。
 */
export async function getMe(
  current: Promise<repository.UserRow & { allDayNotifyMinutes: number }>,
) {
  // 一覧はログイン中のユーザーに依らないので、セッションの検証（current）を待たずに並べて読む
  const [user, users] = await Promise.all([current, listUsers()]);
  return { ...toPublicUser(user), allDayNotifyMinutes: user.allDayNotifyMinutes, users };
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
  const auth = await getAuth();
  const result = await auth.api.signUpEmail({ body: credentials });
  // 色は better-auth の外側の属性なので、作成後に自前で更新する。指定が無ければ既存のユーザーと離れた色相にする
  const existing = await repository.findAll();
  const resolvedHue =
    hue ?? pickDistinctHue(existing.filter((u) => u.id !== result.user.id).map((u) => u.hue));
  const user = await repository.update(result.user.id, { hue: resolvedHue });
  if (!user) throw new Error('created user not found');
  return user;
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
): Promise<void> {
  if (input.password !== undefined && id !== actorId) {
    throw new ForbiddenError('他のユーザーのパスワードは変更できません');
  }
  const { password, ...profile } = input;
  const updated = await repository.update(
    id,
    profile,
    password === undefined ? undefined : await hashPassword(password),
  );
  if (!updated) throw new NotFoundError('ユーザーが見つかりません');
  // 通知時刻が変われば終日の項目の配信予定時刻も変わるので、当日〜翌日の分をその場で予約し直す
  // （古い時刻の予約は配信時の再検証で捨てられる）
  if (input.allDayNotifyMinutes !== undefined) scheduleUpcoming();
}
