import { v5 as uuidv5 } from 'uuid';
import { addCalendarMonths, addDays, today } from '../../../shared/date.ts';
import { newId } from '../../../shared/id.ts';
import {
  BALANCE_PAGE_MONTHS,
  type ExpenseSchedule,
  type ExpenseTotal,
  type MoneyAccount,
  type MoneyBalance,
  type MoneyRecord,
  type Settlement,
  scheduleDatesBetween,
  settlementsOf,
  sortBalances,
} from '../../../shared/money.ts';
import { expenseEntry } from '../../../shared/timeline.ts';
import type { DateString, HistoryPage } from '../../../shared/types.ts';
import {
  type ExpenseInput,
  type ExpenseScheduleInput,
  expenseRulesSchema,
  type MoneyListQuery,
  type MoneyRule,
} from '../../../shared/validation/money.ts';
import { env, type MoneyForwardAccount } from '../../lib/env.ts';
import { NotFoundError, ValidationError } from '../../lib/errors.ts';
import { applyPatch, checkRules } from '../../lib/patch.ts';
import { recordTimelineSource } from '../../lib/timeline-source.ts';
import { publishChanged } from '../mcp-events/service.ts';
import * as repository from './repository.ts';
import { applyRules, type Rewritten } from './rules.ts';
import type { MoneyAccountRow, MoneyRecordRow, MoneyRuleRow, MoneyScheduleRow } from './schema.ts';

/** お金の画面の一覧の 1 ページ（古い順。立替と取り込んだ入出金が 1 本に並ぶ） */
export async function listRecords(query: MoneyListQuery): Promise<HistoryPage<MoneyRecord>> {
  const page = await repository.findPage(query);
  return { ...page, items: page.items.map(toRecord) };
}

/** タイムラインに並べる記録（置く日時は shared/timeline.ts の `expenseEntry`。キーワードは内容の部分一致） */
export const timelineSource = recordTimelineSource(repository.timeline, (row) =>
  expenseEntry(toRecord(row)),
);

/** 立替を帳消しにする最小限の資金移動（式は shared/money.ts の `settlementsOf`）。空なら精算済み */
export async function getSettlements(): Promise<Settlement[]> {
  return settlementsOf(await getTotals());
}

/**
 * 精算の元になる「誰が誰のために払ったか」ごとの合計。手で入れた立替も、取り込みルールで「共有」との立替にした入出金も
 * 同じく当事者を持つので、1 つの集計で出る。クライアントはこれから精算を導く。
 * 書き込みの結果を先に出すとき（楽観的更新）、精算の組み方からは 1 件分を足し引きできないが、
 * 合計なら 1 件分を足し引きするだけで済む
 */
export async function getTotals(): Promise<ExpenseTotal[]> {
  return repository.sumByParties();
}

/**
 * 立替を手で入れる。id はクライアントが決めて送ってくる（`createExpenseRequestSchema`）。省略された呼び出し（MCP）はここで採番する。
 * 組み合わせの規則はここでも掛ける（`checkRules`）。API は入力のスキーマで確かめ済みだが、MCP は LLM の入力から
 * 組み立てた値を渡すので、どの経路の書き込みも規則を通るよう、書き込む所で確かめる（部分更新の `applyPatch` と同じ）。
 */
export async function addExpense(
  input: ExpenseInput,
  userId: string,
  id: string = newId(),
): Promise<MoneyRecord> {
  const values = checkRules(input, expenseRulesSchema);
  const record = toRecord(await repository.insert({ ...values, id, createdBy: userId }));
  publishChanged({ type: 'expense', record }, 'added', { userId });
  return record;
}

/** 全項目を置き換える。記録した人（createdBy）は変えない。actorId は直した人 */
export async function updateExpense(
  id: string,
  input: ExpenseInput,
  actorId: string,
): Promise<void> {
  await write(id, checkRules(input, expenseRulesSchema), actorId);
}

/** 一部の項目だけを変える（MCP。`applyPatch`）。記録した人（createdBy）は変えない。actorId は直した人 */
export async function patchExpense(
  id: string,
  patch: Partial<ExpenseInput>,
  actorId: string,
): Promise<MoneyRecord> {
  const current = await repository.findById(id);
  if (!current) throw new NotFoundError('立替が見つかりません');
  const { fromUserId, toUserId, amount, description, occurredOn } = current;
  const values = applyPatch(
    { fromUserId, toUserId, amount, description, occurredOn },
    patch,
    expenseRulesSchema,
  );
  return write(id, values, actorId);
}

/** 書き換えて、書いた後の立替を返す（直したことを MCP Events で知らせる） */
async function write(id: string, values: ExpenseInput, actorId: string): Promise<MoneyRecord> {
  const record = toRecord((await repository.update(id, values)) ?? (await notWritable(id)));
  publishChanged({ type: 'expense', record }, 'updated', { userId: actorId });
  return record;
}

/** 手で入れた立替を消す。actorId は消した人 */
export async function deleteExpense(id: string, actorId: string): Promise<void> {
  const deleted = (await repository.remove(id)) ?? (await notWritable(id));
  publishChanged({ type: 'expense', record: toRecord(deleted) }, 'deleted', { userId: actorId });
}

/** 書けなかった理由を投げる: 無いか、取り込んだ入出金（直すのは Money Forward と取り込みルール） */
async function notWritable(id: string): Promise<never> {
  if (await repository.findById(id)) {
    throw new ValidationError(
      'Money Forward から取り込んだ入出金は直せません（直すなら Money Forward で。内容欄や立替への読み替えは取り込みルールで）',
    );
  }
  throw new NotFoundError('立替が見つかりません');
}

/** 立替スケジュール（作った順） */
export async function listExpenseSchedules(): Promise<ExpenseSchedule[]> {
  return (await repository.findSchedules()).map(toSchedule);
}

/**
 * 立替スケジュールを作る。最初の日から今日までの回は、その場で立替として記録する
 * （先の日の回は、日が来たら日次の Cron が記録する。`recordScheduledExpenses`）。
 * id はクライアントが決めて送ってくる。同じ id で送り直されたら何も書かない（回を二重に記録しない）
 */
export async function addExpenseSchedule(
  input: ExpenseScheduleInput,
  userId: string,
  id: string = newId(),
  now: Date = new Date(),
): Promise<void> {
  if (await repository.findScheduleById(id)) return;
  const schedule = { ...input, id, createdBy: userId };
  const through = today(now);
  const before = addDays(input.startsOn, -1);
  const due = dueExpenses({ ...schedule, generatedThrough: before }, through);
  const rows = await repository.insertSchedule(
    { ...schedule, generatedThrough: through > before ? through : before },
    due,
  );
  publishAdded(rows);
}

/**
 * 日が来た回を立替として記録する（日次の Cron。日付が変わってすぐ）。どのスケジュールも、記録し終えた日の翌日から
 * 今日までの回を記録する（Cron が止まっていた日の回も、次に動いたときにまとめて記録する）。記録した数を返す。
 * 記録した立替を消しても記録し直さない（記録し終えた日で覚えている）
 */
export async function recordScheduledExpenses(now: Date = new Date()): Promise<{ count: number }> {
  const through = today(now);
  const schedules = await repository.findSchedulesDue(through);
  const rows = await repository.insertDue(
    schedules.map((schedule) => schedule.id),
    through,
    schedules.flatMap((schedule) => dueExpenses(schedule, through)),
  );
  publishAdded(rows);
  return { count: rows.length };
}

/**
 * スケジュールを書き換える（全項目の置き換え）。まだ記録していない回（明日から）にだけ効き、記録した立替はそのまま
 * （記録した立替は普通の立替なので、直すならその立替を直す）
 */
export async function updateExpenseSchedule(
  id: string,
  input: ExpenseScheduleInput,
): Promise<void> {
  if (!(await repository.updateSchedule(id, input))) {
    throw new NotFoundError('立替スケジュールが見つかりません');
  }
}

/** スケジュールを消す（これからの回を記録しない）。記録した立替は残る */
export async function deleteExpenseSchedule(id: string): Promise<void> {
  if (!(await repository.removeSchedule(id))) {
    throw new NotFoundError('立替スケジュールが見つかりません');
  }
}

/**
 * スケジュールの回の立替の ID の名前空間（UUID v5）。値に意味は無く、変えると記録済みの回と ID が合わなくなる
 */
const SCHEDULED_EXPENSE_NAMESPACE = 'a308985f-61ed-464d-a652-fef620e84c40';

/**
 * スケジュールの、記録し終えた日の翌日から through までの回。ID はスケジュールと日から決める。
 * WHY: 記録は「記録し終えた日より後の回を読み、記録して日を進める」の 2 往復で、Cron が重ねて走る
 * （Vercel が同じ Cron を 2 度呼ぶ、手で呼ぶ）と両方が同じ回を読む。ID が同じなので後の記録は
 * 主キーで何も書かず、同じ回を二重に記録しない。
 * WHY NOT UUID v7（ほかの行と同じ）: 書くたびに違う ID になり、重なった記録を見分けられない。
 * 立替の並びは記録した日時が先で、ID は同時刻の並びを決めるだけなので、時刻順でなくても困らない。
 */
function dueExpenses(
  schedule: ExpenseScheduleInput & Pick<MoneyScheduleRow, 'id' | 'createdBy' | 'generatedThrough'>,
  through: DateString,
): repository.NewExpense[] {
  return scheduleDatesBetween(schedule, schedule.generatedThrough, through).map((occurredOn) => ({
    id: uuidv5(`${schedule.id}:${occurredOn}`, SCHEDULED_EXPENSE_NAMESPACE),
    fromUserId: schedule.fromUserId,
    toUserId: schedule.toUserId,
    amount: schedule.amount,
    description: schedule.description,
    occurredOn,
    createdBy: schedule.createdBy,
  }));
}

/** 記録した立替を MCP Events で知らせる（記録した人はスケジュールを作った人） */
function publishAdded(rows: MoneyRecordRow[]): void {
  for (const row of rows) {
    // スケジュールが記録する立替は、手で入れた立替と同じく必ず記録した人を持つ
    if (row.createdBy) {
      publishChanged({ type: 'expense', record: toRecord(row) }, 'added', {
        userId: row.createdBy,
      });
    }
  }
}

/** 取り込む口座（環境変数 `MONEYFORWARD_ACCOUNTS` に書いた順）。書いていなければ空 */
const configuredAccounts: readonly MoneyForwardAccount[] = env.MONEYFORWARD_ACCOUNTS ?? [];

const accountNames = configuredAccounts.map((account) => account.name);

/** クレジットカードの口座の名前（値の記録では負債額を、Money Forward の利用残高の符号に依らず大きさに - を付けて持つ） */
const cardNames = new Set(
  configuredAccounts.filter((account) => account.kind === 'card').map((account) => account.name),
);

/**
 * Money Forward から口座の値と入出金を取り込む（日次の Cron）。取り込んだ明細と口座の数を返す。
 * 口座の値はその日（JST）の記録としても残す（残高の推移のグラフ。`money_balances`）。
 * 入出金は先月と今月の 2 か月分の CSV を読み、読んだ明細の最も古い日から最も新しい日までを、Money Forward の今の明細に
 * 置き換える（`saveImport`。Money Forward で消された明細はここで消える）。環境変数から外した口座の行と明細も、ここで消す。
 * 手で入れた立替には触らない。
 * WHY 外した口座を取り込みで消す: 読むたびに今の口座で絞ると、画面・タイムライン・MCP のどの読み出しにも同じ条件が要り、
 * 消えない行が溜まり続ける。外したことが画面に出るのは次の取り込みから（すぐ消したければ Cron を手で呼ぶ）。
 * WHY 先月も: カードの明細は使った日から数日遅れて届くので、月の初めに読むと先月の終わりの明細がまだ増える。
 * WHY NOT もっと前まで: 古い明細はもう変わらず、月ごとに CSV を読むぶん取り込みが長くなる。
 * WHY 置き換える範囲を読んだ明細の日付で決める: Money Forward は月の始まりの日を設定で変えられ、CSV が暦の月と
 * ずれることがある。暦の月で置き換えると、CSV に載らなかった日の明細を消してしまう。
 * ログイン情報か口座が無ければ何もしない（本番では起動時に止まる。`server/lib/env.ts` の `PRODUCTION_REQUIRED`）。
 * 取り込みに失敗したら何も書かずに投げる（前回の値が残る。Cron の失敗として残す）。
 * ブラウザと CSV・2 段階認証の部品は取り込みのときだけ読む（同じ関数が受ける画面の API の要求のたびに読み込まない）。
 */
export async function syncMoneyForward(
  now: Date = new Date(),
): Promise<{ records: number; accounts: number } | { skipped: true }> {
  const {
    MONEYFORWARD_EMAIL: email,
    MONEYFORWARD_PASSWORD: password,
    MONEYFORWARD_TOTP_SECRET: totpSecret,
    MONEYFORWARD_GROUP: group,
  } = env;
  if (!email || !password || configuredAccounts.length === 0) return { skipped: true };

  const [{ scrapeMoneyForward }, { parseTransactionsCsv }] = await Promise.all([
    import('./moneyforward.ts'),
    import('./parse.ts'),
  ]);
  // 年月（YYYY-MM）。Money Forward の CSV は月ごとに読む
  const months = [addCalendarMonths(today(now), -1), today(now)].map((day) => day.slice(0, 7));
  const [scraped, rules] = await Promise.all([
    scrapeMoneyForward({
      credentials: { email, password, totpSecret },
      accounts: configuredAccounts,
      months,
      group,
    }),
    listRules(),
  ]);

  // 2 か月の CSV の境目で同じ明細が重なっても 1 行にする。内容欄は今のルールで読み替える（元のままの内容欄も持つ）
  const rewrite = applyRules(rules);
  const records = [
    ...new Map(
      scraped.csvs
        .flatMap((csv) => parseTransactionsCsv(csv, accountNames))
        .map((row) => [row.sourceId, { ...row, ...rewrite(row.originalDescription), id: newId() }]),
    ).values(),
  ];
  const days = records.map((row) => row.occurredOn).sort();
  const [from, to] = [days[0], days.at(-1)];
  const fetchedAt = new Date();
  await repository.saveImport({
    accounts: accountNames,
    range: from && to ? { from, to } : null,
    records,
    accountRows: scraped.accounts.map((account) => ({ ...account, fetchedAt })),
    balanceRows: scraped.accounts.flatMap(({ name, balance }) =>
      balance === null
        ? []
        : [
            {
              account: name,
              recordedOn: today(now),
              balance: cardNames.has(name) ? -Math.abs(balance) : balance,
            },
          ],
    ),
  });
  return { records: records.length, accounts: scraped.accounts.length };
}

/** お金の画面のカード（環境変数に書いた順）。まだ取り込んでいない口座は値を null にして並べる */
export async function listAccounts(): Promise<MoneyAccount[]> {
  const rows = new Map((await repository.findAccounts()).map((row) => [row.name, row]));
  return configuredAccounts.map((account) => toAccount(account, rows.get(account.name)));
}

/**
 * 残高の推移の 1 ページ（今取り込んでいる口座すべて）。before（省けば明日）より前の BALANCE_PAGE_MONTHS か月の日の記録を、
 * 日の古い順に返す。nextCursor はこのページの始まりの日で、それより前の記録が無ければ null。
 * WHY 件数ではなく期間で区切る: グラフは期間で見るもので、開いたときに要る期間が 1 回の取得で揃う。
 * 1 日の行は口座の数だけなので、6 か月でも千行ほどに収まる。
 * 値は記録したときに `MoneyBalance` の向きにしてある（カードの負債額は負の数）
 */
export async function getBalancePage(
  before: DateString | undefined,
  now: Date = new Date(),
): Promise<HistoryPage<MoneyBalance>> {
  const end = before ?? addDays(today(now), 1);
  const from = addCalendarMonths(end, -BALANCE_PAGE_MONTHS);
  const { rows, hasOlder } = await repository.findBalances(from, end);
  return {
    items: sortBalances(
      rows.map((row) => ({ account: row.account, on: row.recordedOn, amount: row.balance })),
    ),
    nextCursor: hasOlder ? from : null,
  };
}

/** 入出金の読み替えのルール（上から順） */
export async function listRules(): Promise<MoneyRule[]> {
  return (await repository.findRules()).map(toRule);
}

/**
 * ルールの並びを置き換え、取り込み済みのすべての入出金を新しいルールで読み替え直す（元の内容欄から当て直すので、
 * 足した・直した・消したルールが過去の入出金にも効く）。userId は保存した人。
 * 入出金は数千件の桁なので、全件を読んで当て直し、読み替えが変わった行だけを 1 つの update で書く（`replaceRules`。
 * 並べ替えだけなら、たいてい書く行は無い）
 */
export async function saveRules(rules: MoneyRule[], userId: string): Promise<void> {
  const rewrite = applyRules(rules);
  const changed = (await repository.findRewritten()).flatMap(
    ({ id, originalDescription, ...current }) => {
      const next = rewrite(originalDescription);
      const same = (Object.keys(next) as (keyof Rewritten)[]).every(
        (key) => next[key] === current[key],
      );
      return same ? [] : [{ id, ...next }];
    },
  );
  await repository.replaceRules(rules, userId, changed);
}

/** カードの利用残高は出さない（カードのタイルは次回の引き落とし。引き落としの値はカードの行だけが持つ。`moneyforward.ts`） */
function toAccount(
  { name, kind }: MoneyForwardAccount,
  row: MoneyAccountRow | undefined,
): MoneyAccount {
  return {
    name,
    kind,
    balance: kind === 'card' ? null : (row?.balance ?? null),
    withdrawalAmount: row?.withdrawalAmount ?? null,
    withdrawalOn: row?.withdrawalOn ?? null,
    fetchedAt: row?.fetchedAt.toISOString() ?? null,
  };
}

function toRecord(row: MoneyRecordRow): MoneyRecord {
  return {
    id: row.id,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    amount: row.amount,
    description: row.description,
    occurredOn: row.occurredOn,
    createdAt: row.createdAt.toISOString(),
    account: row.account,
  };
}

function toSchedule(row: MoneyScheduleRow): ExpenseSchedule {
  const { id, fromUserId, toUserId, amount, description, startsOn, frequency } = row;
  return { id, fromUserId, toUserId, amount, description, startsOn, frequency };
}

function toRule({
  id,
  pattern,
  replaceDescription,
  replacement,
  kind,
  userId,
  hidden,
}: MoneyRuleRow): MoneyRule {
  return { id, pattern, replaceDescription, replacement, kind, userId, hidden };
}
