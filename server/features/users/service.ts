import { hashPassword } from 'better-auth/crypto';
import { pickDistinctHue } from '../../../shared/color.ts';
import type {
  CreateUserInput,
  RegisterUserInput,
  UpdateUserInput,
} from '../../../shared/validation/users.ts';
import { getAuth } from '../../lib/auth.ts';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.ts';
import { scheduleUpcoming } from '../notifications/service.ts';
import * as repository from './repository.ts';

export async function listUsers() {
  return repository.findAll();
}

/** 外に出すユーザーの形（better-auth のセッションが持つユーザーからも作れる） */
function toPublicUser(user: repository.UserRow): repository.UserRow {
  return { id: user.id, name: user.name, email: user.email, hue: user.hue };
}

/**
 * ログイン中のユーザーとユーザーの一覧（`me.get`）。本人は公開の形に本人だけが使う設定を足したもの。
 * 本人はセッションの検証で読んだユーザーをそのまま使う（hue と通知時刻も載っている。server/lib/auth.ts）。
 * WHY 一覧も載せる: 名前と色を出す所は本人（先頭に並べる・自分の色）と一覧を必ず一緒に読むので、
 * 別々に問い合わせると起動のたびに 2 本になる。一覧は 2 人分だけで小さい。
 */
export async function getMe(user: repository.UserRow & { allDayNotifyMinutes: number }) {
  const users = await listUsers();
  return { ...toPublicUser(user), allDayNotifyMinutes: user.allDayNotifyMinutes, users };
}

/**
 * 操作する人（ログイン中のユーザー）が今のパスワードを知っていることを確かめる。違えば ForbiddenError。
 * パスワードの変更とユーザーの登録の前に呼び、奪ったセッションだけでは持ち主を締め出したり
 * 別のユーザーという入口を作ったりできないようにする。
 * 確かめ方は better-auth の `/verify-password` と同じ（資格情報の行の読み方もハッシュの照合もログインと揃う）。
 * WHY NOT `auth.api.verifyPassword` を呼ぶ: 要求のヘッダーからセッションを引き直すので、
 * 確かめ済みのセッション（ctx.user）があるのにもう一度 DB を読む。
 */
async function verifyActorPassword(actorId: string, password: string | undefined): Promise<void> {
  if (password !== undefined) {
    const { internalAdapter, password: hasher } = await (await getAuth()).$context;
    const hash = (await internalAdapter.findCredentialAccount(actorId))?.password;
    if (hash && (await hasher.verify({ hash, password }))) return;
  }
  throw new ForbiddenError('今のパスワードが違います');
}

/** 画面からユーザーを作る。actorId は登録する人（ログイン中のユーザー）で、その人の今のパスワードを確かめてから作る */
export async function registerUser(
  { currentPassword, ...input }: RegisterUserInput,
  actorId: string,
): Promise<repository.UserRow> {
  await verifyActorPassword(actorId, currentPassword);
  return createUser(input);
}

/**
 * ユーザーを作る。パスワードのハッシュは better-auth に任せる。
 * 公開のサインアップ経路は閉じているので、`registerUser`（画面）と scripts/create-user.ts だけが作成経路になる。
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
 * 名前・色・通知時刻は家族で管理する共有プロフィールなので誰でも変えられるが、パスワードは本人だけが、
 * 今のパスワードを添えたときだけ変えられる。本人だけに絞らないと、片方のセッションを得た攻撃者がもう片方の
 * パスワードも奪える。今のパスワードを求めないと、セッションを得た攻撃者がパスワードを変えて持ち主を締め出せる。
 */
export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actorId: string,
): Promise<void> {
  const { password, currentPassword, ...profile } = input;
  if (password !== undefined) {
    if (id !== actorId) throw new ForbiddenError('他のユーザーのパスワードは変更できません');
    await verifyActorPassword(actorId, currentPassword);
  }
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
