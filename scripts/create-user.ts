import { parseArgs } from 'node:util';
import { createUser } from '../server/features/users/service.ts';
import { createUserSchema } from '../shared/validation/users.ts';

/**
 * 最初のユーザーを作る。`DATABASE_URL` に直接接続し、users service（better-auth 標準のハッシュ）で投入する。
 * 2 人目以降は /admin/users から登録する。
 *
 *   pnpm user:create --email you@example.com --name あなた --password 'xxxxxxxxxxxx'
 */
const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    password: { type: 'string' },
  },
});

const parsed = createUserSchema.safeParse(values);
if (!parsed.success) {
  console.error('usage: pnpm user:create --email <email> --name <name> --password <password>');
  for (const issue of parsed.error.issues)
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

const user = await createUser(parsed.data);
console.log(`created user ${user.id} (${user.email})`);
process.exit(0);
