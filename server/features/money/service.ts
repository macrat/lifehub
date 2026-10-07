import { v5 as uuidv5 } from 'uuid';
import { addDays, today } from '../../../shared/date.ts';
import { newId } from '../../../shared/id.ts';
import {
  type ExpenseSchedule,
  type ExpenseTotal,
  type MoneyRecord,
  type Settlement,
  scheduleDatesBetween,
  settlementsOf,
} from '../../../shared/money.ts';
import { expenseEntry } from '../../../shared/timeline.ts';
import type { DateString, HistoryPage } from '../../../shared/types.ts';
import {
  type ExpenseInput,
  type ExpenseScheduleInput,
  expenseRulesSchema,
  type MoneyListQuery,
} from '../../../shared/validation/money.ts';
import { NotFoundError, ValidationError } from '../../lib/errors.ts';
import { applyPatch, checkRules } from '../../lib/patch.ts';
import { recordTimelineSource } from '../../lib/timeline-source.ts';
import { publishChanged } from '../mcp-events/service.ts';
import * as repository from './repository.ts';
import type { MoneyRecordRow, MoneyScheduleRow } from './schema.ts';

export {
  getBalancePage,
  listAccounts,
  listRules,
  saveRules,
  syncMoneyForward,
} from './sync.ts';

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
  // 取り込んだ入出金は規則を掛ける前に断る（直せない理由より先に、項目の規則の誤りを返さない）
  if (!current || current.account !== null) notWritable(current);
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
  const record = toRecord(
    (await repository.update(id, values)) ?? notWritable(await repository.findById(id)),
  );
  publishChanged({ type: 'expense', record }, 'updated', { userId: actorId });
  return record;
}

/** 手で入れた立替を消す。actorId は消した人 */
export async function deleteExpense(id: string, actorId: string): Promise<void> {
  const deleted = (await repository.remove(id)) ?? notWritable(await repository.findById(id));
  publishChanged({ type: 'expense', record: toRecord(deleted) }, 'deleted', { userId: actorId });
}

/** 書けなかった理由を投げる: 無いか（row が undefined）、取り込んだ入出金（直すのは Money Forward と取り込みルール） */
function notWritable(row: MoneyRecordRow | undefined): never {
  if (row) {
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
