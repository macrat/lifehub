import { addDays, today } from '../../../shared/date.ts';
import {
  type Expense,
  type ExpenseSchedule,
  type ExpenseTotal,
  type Settlement,
  scheduleDatesBetween,
  settlementsOf,
} from '../../../shared/expenses.ts';
import { newId } from '../../../shared/id.ts';
import {
  expenseMoneyEntry,
  type MoneyEntry,
  sortMoneyEntries,
  transactionMoneyEntry,
} from '../../../shared/money.ts';
import { expenseEntry } from '../../../shared/timeline.ts';
import type { DateString, HistoryPage } from '../../../shared/types.ts';
import {
  type ExpenseFilter,
  type ExpenseInput,
  type ExpenseListQuery,
  type ExpenseScheduleInput,
  expenseRulesSchema,
} from '../../../shared/validation/expenses.ts';
import { NotFoundError } from '../../lib/errors.ts';
import { type HistorySource, mergeHistoryPage } from '../../lib/history-source.ts';
import { applyPatch, checkRules } from '../../lib/patch.ts';
import { recordTimelineSource } from '../../lib/timeline-source.ts';
import { publishChanged } from '../mcp-events/service.ts';
import * as money from '../money/service.ts';
import type { ScheduledExpense } from './repository.ts';
import * as repository from './repository.ts';
import type { ExpenseRow, ExpenseScheduleRow } from './schema.ts';

/**
 * お金の画面の一覧に並べる立替（`HistorySource`。日は使った日）。絞り込みは範囲の両端を含み、キーワードは内容の部分一致。
 * 一覧は入出金と 1 本に並べるので、ページに分けるのはお金の service（`listMoney`）
 */
export function historySource(filter: ExpenseFilter): HistorySource<Expense> {
  const queries = repository.history(filter);
  return {
    recentDays: queries.recentDays,
    hasBefore: queries.hasBefore,
    findInDays: async (from, before) => (await queries.findInDays(from, before)).map(toExpense),
  };
}

/** タイムラインに並べる立替（置く日時は shared/timeline.ts の `expenseEntry`。キーワードは内容の部分一致） */
export const timelineSource = recordTimelineSource(repository.timeline, (row) =>
  expenseEntry(toExpense(row)),
);

/**
 * 立替を帳消しにする最小限の資金移動（式は shared/expenses.ts の `settlementsOf`）。空なら精算済み。
 * 取り込んだ入出金のうち、ルールで「共有」との立替にしたものも入れる（`getTotals`）
 */
export async function getSettlements(): Promise<Settlement[]> {
  return settlementsOf(await getTotals());
}

/**
 * 精算の元になる「誰が誰のために払ったか」ごとの合計。立替の組ごとと、取り込んだ入出金のうちルールで「共有」との立替にした
 * ものの組ごと（money の `getTransferTotals`）を並べる（同じ組が 2 行になりうるが、精算の式は足し合わせる）。
 * クライアントはこれから精算を導く。
 * 書き込みの結果を先に出すとき（楽観的更新）、精算の組み方からは 1 件分を足し引きできないが、
 * 合計なら 1 件分を足し引きするだけで済む
 */
export async function getTotals(): Promise<ExpenseTotal[]> {
  const [expenses, transfers] = await Promise.all([
    repository.sumByDirection(),
    money.getTransferTotals(),
  ]);
  return [...expenses, ...transfers];
}

/**
 * お金の画面の一覧の 1 ページ（古い順）: 立替と取り込んだ入出金を 1 本に並べる。絞り込みは立替の一覧と同じ条件
 * （入出金への読み替えは money の `historySource`）。ページの分け方は立替だけの履歴と同じで、日の途中では切らない
 * （`mergeHistoryPage`）。立替の feature が並べるのは、精算と同じく、入出金を立替の側から読むため
 * （入出金の feature は立替を読まない。依存は立替 → 入出金の一方向）
 */
export async function listMoneyEntries({
  before,
  ...filter
}: ExpenseListQuery): Promise<HistoryPage<MoneyEntry>> {
  const page = await mergeHistoryPage<MoneyEntry>(
    [
      mapSource(historySource(filter), expenseMoneyEntry),
      mapSource(money.historySource(filter), transactionMoneyEntry),
    ],
    before,
  );
  return { ...page, items: sortMoneyEntries(page.items) };
}

/** 出どころの行を一覧の行にする */
function mapSource<T>(
  source: HistorySource<T>,
  toEntry: (record: T) => MoneyEntry,
): HistorySource<MoneyEntry> {
  return {
    ...source,
    findInDays: async (from, before) => (await source.findInDays(from, before)).map(toEntry),
  };
}

/**
 * id はクライアントが決めて送ってくる（`createExpenseRequestSchema`）。省略された呼び出し（MCP）はここで採番する。
 * 組み合わせの規則はここでも掛ける（`checkRules`）。API は入力のスキーマで確かめ済みだが、MCP は LLM の入力から
 * 組み立てた値を渡すので、どの経路の書き込みも規則を通るよう、書き込む所で確かめる（部分更新の `applyPatch` と同じ）。
 */
export async function addExpense(
  input: ExpenseInput,
  userId: string,
  id: string = newId(),
): Promise<Expense> {
  const values = checkRules(input, expenseRulesSchema);
  const expense = toExpense(await repository.insert({ ...values, id, createdBy: userId }));
  publishChanged({ type: 'expense', record: expense }, 'added', { userId });
  return expense;
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
): Promise<Expense> {
  const current = await repository.findById(id);
  if (!current) throw new NotFoundError('立替が見つかりません');
  const { fromUserId, toUserId, amount, description, spentOn } = current;
  const values = applyPatch(
    { fromUserId, toUserId, amount, description, spentOn },
    patch,
    expenseRulesSchema,
  );
  return write(id, values, actorId);
}

/** 書き換えて、書いた後の立替を返す（直したことを MCP Events で知らせる） */
async function write(id: string, values: ExpenseInput, actorId: string): Promise<Expense> {
  const updated = await repository.update(id, values);
  if (!updated) throw new NotFoundError('立替が見つかりません');
  const expense = toExpense(updated);
  publishChanged({ type: 'expense', record: expense }, 'updated', { userId: actorId });
  return expense;
}

/** actorId は消した人 */
export async function deleteExpense(id: string, actorId: string): Promise<void> {
  const deleted = await repository.remove(id);
  if (!deleted) throw new NotFoundError('立替が見つかりません');
  publishChanged({ type: 'expense', record: toExpense(deleted) }, 'deleted', { userId: actorId });
}

/** 立替スケジュール（作った順） */
export async function listExpenseSchedules(): Promise<ExpenseSchedule[]> {
  return (await repository.findSchedules()).map(toSchedule);
}

/**
 * 立替スケジュールを作る。最初の日（spentOn）から今日までの回は、その場で立替として記録する
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
  const values = scheduleValues(input);
  const through = today(now);
  const before = addDays(values.startsOn, -1);
  const due = dueExpenses({ ...values, id, createdBy: userId, generatedThrough: before }, through);
  const rows = await repository.insertSchedule(
    { ...values, id, createdBy: userId, generatedThrough: through > before ? through : before },
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
  if (!(await repository.updateSchedule(id, scheduleValues(input)))) {
    throw new NotFoundError('立替スケジュールが見つかりません');
  }
}

/** スケジュールを消す（これからの回を記録しない）。記録した立替は残る */
export async function deleteExpenseSchedule(id: string): Promise<void> {
  if (!(await repository.removeSchedule(id))) {
    throw new NotFoundError('立替スケジュールが見つかりません');
  }
}

/** 入力（spentOn は最初の日）→ スケジュールの行の値。組み合わせの規則もここで掛ける（`checkRules`） */
function scheduleValues({ frequency, ...input }: ExpenseScheduleInput) {
  const { spentOn, ...values } = checkRules(input, expenseRulesSchema);
  return { ...values, startsOn: spentOn, frequency };
}

/** スケジュールの、記録し終えた日の翌日から through までの回 */
function dueExpenses(
  schedule: Omit<ExpenseScheduleRow, 'createdAt' | 'updatedAt'>,
  through: DateString,
): ScheduledExpense[] {
  return scheduleDatesBetween(schedule, schedule.generatedThrough, through).map((spentOn) => ({
    id: newId(),
    fromUserId: schedule.fromUserId,
    toUserId: schedule.toUserId,
    amount: schedule.amount,
    description: schedule.description,
    spentOn,
    createdBy: schedule.createdBy,
  }));
}

/** 記録した立替を MCP Events で知らせる（記録した人はスケジュールを作った人） */
function publishAdded(rows: ExpenseRow[]): void {
  for (const row of rows) {
    publishChanged({ type: 'expense', record: toExpense(row) }, 'added', { userId: row.createdBy });
  }
}

function toSchedule(row: ExpenseScheduleRow): ExpenseSchedule {
  const { id, fromUserId, toUserId, amount, description, startsOn, frequency } = row;
  return { id, fromUserId, toUserId, amount, description, startsOn, frequency };
}

function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    amount: row.amount,
    description: row.description,
    spentOn: row.spentOn,
    createdAt: row.createdAt.toISOString(),
  };
}
