import * as events from '../server/features/events/service.ts';
import * as lemon from '../server/features/lemon/service.ts';
import * as memos from '../server/features/memos/service.ts';
import * as money from '../server/features/money/service.ts';
import * as users from '../server/features/users/service.ts';
import { clearTables } from '../server/lib/db/test-db.ts';
import { addDays, startOfDate, today } from '../shared/date.ts';
import { createEventSchema } from '../shared/validation/events.ts';

/**
 * ローカル開発用のサンプルデータ。全テーブルを空にしてから投入する（本番では絶対に実行しない）。
 *
 *   pnpm db:seed
 *
 * ユーザー: taro@example.com / hanako@example.com（パスワードはどちらも password-123456）
 */
if (process.env.VERCEL_ENV === 'production') {
  console.error('本番環境では実行できません');
  process.exit(1);
}

await clearTables();
const me = await users.createUser({
  email: 'taro@example.com',
  name: '太郎',
  password: 'password-123456',
  hue: 335,
});
const partner = await users.createUser({
  email: 'hanako@example.com',
  name: '花子',
  password: 'password-123456',
  hue: 200,
});
const t = today();
const at = (d: string, hm: string) => new Date(`${d}T${hm}:00+09:00`).toISOString();
const dayAt = (offset: number, hour: number) =>
  new Date(startOfDate(addDays(t, offset)).getTime() + hour * 3600e3);

const both = [me.id, partner.id];
const event = (input: Record<string, unknown>, by = me.id) =>
  events.createEvent(
    createEventSchema.parse({ kind: 'event', participantIds: both, ...input }),
    by,
  );
const task = (input: Record<string, unknown>, by = me.id) =>
  events.createEvent(createEventSchema.parse({ kind: 'task', participantIds: both, ...input }), by);

await event({
  title: '歯医者',
  startsAt: at(t, '15:00'),
  endsAt: at(t, '16:00'),
  participantIds: [me.id],
  location: '駅前デンタル',
  remindStartMinutes: 30,
});
await event({
  title: '週次ミーティング',
  startsAt: at(addDays(t, 1), '09:30'),
  endsAt: at(addDays(t, 1), '10:00'),
  participantIds: [me.id],
  rrule: 'FREQ=WEEKLY',
});
await event({
  title: '実家に帰省',
  allDay: true,
  startsAt: at(addDays(t, 3), '00:00'),
  endsAt: at(addDays(t, 5), '00:00'),
  note: '新幹線 10:20 発',
});
await event(
  {
    title: 'ヨガ',
    startsAt: at(addDays(t, 2), '19:00'),
    endsAt: at(addDays(t, 2), '20:00'),
    participantIds: [partner.id],
    rrule: 'FREQ=WEEKLY',
  },
  partner.id,
);
await event({
  title: '結婚記念日',
  allDay: true,
  startsAt: at(addDays(t, 12), '00:00'),
  endsAt: at(addDays(t, 12), '00:00'),
  rrule: 'FREQ=YEARLY',
  remindStartMinutes: 1440,
});
await event(
  {
    title: '友人と食事',
    startsAt: at(addDays(t, -2), '19:00'),
    endsAt: at(addDays(t, -2), '21:30'),
    participantIds: [partner.id],
    location: '新宿',
  },
  partner.id,
);

await task({ title: '牛乳と卵を買う', endsAt: at(t, '20:00'), remindEndMinutes: 0 });
await task({
  title: '燃えるゴミを出す',
  startsAt: at(addDays(t, -1), '07:00'),
  rrule: 'FREQ=WEEKLY',
  remindStartMinutes: 0,
});
await task({ title: '税金の支払い', endsAt: at(addDays(t, -3), '23:59'), participantIds: [me.id] });
await task({
  title: 'プレゼントを選ぶ',
  startsAt: at(addDays(t, 4), '10:00'),
  endsAt: at(addDays(t, 10), '18:00'),
  participantIds: [partner.id],
});
const done = await task({ title: '電球を交換する', participantIds: [me.id] });
await events.completeEvent(done.id, {}, me.id, dayAt(0, 9));

await money.addExpense(
  {
    fromUserId: me.id,
    toUserId: null,
    amount: 6480,
    description: '食材（スーパー）',
    occurredOn: addDays(t, -1),
  },
  me.id,
);
await money.addExpense(
  {
    fromUserId: partner.id,
    toUserId: null,
    amount: 2200,
    description: '日用品',
    occurredOn: addDays(t, -3),
  },
  partner.id,
);
await money.addExpense(
  {
    fromUserId: me.id,
    toUserId: null,
    amount: 12000,
    description: '電気代',
    occurredOn: addDays(t, -7),
  },
  me.id,
);

await money.addExpense(
  {
    fromUserId: partner.id,
    toUserId: me.id,
    amount: 5000,
    description: '精算',
    occurredOn: addDays(t, -2),
  },
  partner.id,
);

await lemon.logCare(
  { careTypes: ['harvest'], doneAt: dayAt(-60, 10), note: '黄色くなった実を3個' },
  { userId: me.id },
);
await lemon.logCare(
  { careTypes: ['mist', 'water', 'fertilize'], doneAt: dayAt(-20, 9), note: '緩効性肥料' },
  { userId: me.id },
);
await lemon.logCare(
  // やったことを 1 つも選ばない記録はメモそのもの
  { careTypes: [], doneAt: dayAt(-5, 12), note: '新芽が出てきた。葉の裏にアブラムシなし。' },
  { userId: partner.id },
);
await lemon.logCare(
  { careTypes: ['mist', 'water'], doneAt: dayAt(-2, 8), note: null },
  { userId: me.id },
);
await lemon.logCare(
  {
    careTypes: ['mist', 'bloom', 'drop'],
    doneAt: dayAt(-1, 8),
    note: '花が咲いた。小さい実が2つ落ちていた',
  },
  { userId: partner.id },
);
// メモの日時は書いた時刻（今）になる
await memos.addMemo(
  { body: '週末は天気が良さそう。\nベランダの掃除をしたい。' },
  { userId: partner.id },
);
await memos.addMemo(
  { body: '洗剤の詰め替えが残り少ない' },
  { userId: me.id, mcpClientName: 'Claude' },
);

console.log('seeded: taro@example.com / hanako@example.com (password-123456)');
process.exit(0);
