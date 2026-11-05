import { parseArgs } from 'node:util';
import { resetPassword } from '../server/features/users/service.ts';
import { resetPasswordSchema } from '../shared/validation/users.ts';

/**
 * パスワードを忘れたユーザーのパスワードを書き換える。`DATABASE_URL` に直接接続し、users service で書き換える。
 * そのユーザーの全端末のセッションは切れる。画面からは本人が今のパスワードを添えてしか変えられないので、
 * 忘れたときはこれを使う。
 *
 *   pnpm user:reset-password --email you@example.com --password 'xxxxxxxxxxxx'
 */
const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
  },
});

const parsed = resetPasswordSchema.safeParse(values);
if (!parsed.success) {
  console.error('usage: pnpm user:reset-password --email <email> --password <password>');
  for (const issue of parsed.error.issues)
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

const user = await resetPassword(parsed.data);
console.log(`reset password of user ${user.id} (${user.email})`);
process.exit(0);
