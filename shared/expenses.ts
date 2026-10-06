import { addCalendarMonths, addDays } from './date.ts';
import { compareKeys } from './sort.ts';
import type { DateString } from './types.ts';

/**
 * 立替の行と、そこから導かれる精算。
 * サーバーの一覧・精算と、クライアントの楽観的更新が同じ式を使うため、共通に置く。
 */

export type Expense = {
  id: string;
  /** null は共有（共有口座から払った） */
  fromUserId: string | null;
  /** null は共有（共有口座のために払った） */
  toUserId: string | null;
  amount: number;
  description: string;
  spentOn: DateString;
  createdAt: string;
};

/** 立替スケジュールの繰り返し */
export const SCHEDULE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCIES)[number];

/**
 * 立替スケジュール（設定の「立替スケジュール」）。日が来たら、この内容の立替を 1 件ずつ記録する。
 * startsOn は最初の日、frequency は繰り返し。終わりは持たない（止めるならスケジュールを消す）
 */
export type ExpenseSchedule = {
  id: string;
  fromUserId: string | null;
  toUserId: string | null;
  amount: number;
  description: string;
  startsOn: DateString;
  frequency: ScheduleFrequency;
};

/**
 * スケジュールの n 回目（0 が最初の日）の日。どの回も最初の日から数える（前の回から数えない）ので、毎月・毎年で
 * 無い日（31 日、2/29）はその月の末日になり、次の月には元の日に戻る（1/31 → 2/28 → 3/31。ずれていかない）
 */
function scheduleDate(
  { startsOn, frequency }: Pick<ExpenseSchedule, 'startsOn' | 'frequency'>,
  n: number,
): DateString {
  switch (frequency) {
    case 'daily':
      return addDays(startsOn, n);
    case 'weekly':
      return addDays(startsOn, n * 7);
    case 'monthly':
      return addCalendarMonths(startsOn, n);
    case 'yearly':
      return addCalendarMonths(startsOn, n * 12);
  }
}

/** スケジュールの、after より後で through まで（両端のうち through を含む）の回の日 */
export function scheduleDatesBetween(
  schedule: Pick<ExpenseSchedule, 'startsOn' | 'frequency'>,
  after: DateString,
  through: DateString,
): DateString[] {
  const dates: DateString[] = [];
  for (let n = 0; ; n++) {
    const date = scheduleDate(schedule, n);
    if (date > through) return dates;
    if (date > after) dates.push(date);
  }
}

/** スケジュールの、after より後の最初の回の日（次に記録する日） */
export function nextScheduleDate(
  schedule: Pick<ExpenseSchedule, 'startsOn' | 'frequency'>,
  after: DateString,
): DateString {
  for (let n = 0; ; n++) {
    const date = scheduleDate(schedule, n);
    if (date > after) return date;
  }
}

/** 「誰が誰のために払ったか」ごとの合計。null は共有 */
export type ExpenseTotal = {
  fromUserId: string | null;
  toUserId: string | null;
  amount: number;
};

/** 帳消しにするための資金移動 1 つ。debtorId が creditorId に amount 円を払う。null は共有 */
export type Settlement = {
  creditorId: string | null;
  debtorId: string | null;
  amount: number;
};

/**
 * 立替を帳消しにする最小限の資金移動。立替はユーザーと共有（共有口座）の間の資金の貸し借りとみなす:
 * X が Y のために払うと、X に債権が、Y に債務が amount 円生じる（共有のために払えば共有の債務、
 * 共有から引き出せば引き出した人の債務）。精算も「債務者が債権者のために払った」行として同じ式に入るので、払えば債務が減る。
 *
 * 当事者ごとに債権と債務を差し引いた額（正味）を出してから、最も大きい債権者と最も大きい債務者を
 * 突き合わせて移動を決めていく。正味にしてから組むので、循環（A→B→共有→A のような貸し借り）は打ち消される。
 * 正味が 0 でない当事者が n 人なら移動は高々 n − 1 回で、当事者が 3 者（ユーザー 2 人と共有）なら
 * これが最小になる（2 者なら 1 回、3 者とも 0 でなければ 2 回より少なくはできない）。
 * WHY NOT 一般の最小化: 当事者が増えると最小の組み方を探すのは組み合わせの問題になるが、利用者は 2 人なので要らない。
 *
 * 並びは額の大きい順（同じ額なら当事者の順。`compareParty`）。
 * 式はここ 1 か所だけに置く。サーバーは SQL で出した合計を渡し（全行を読まずに済む）、
 * クライアントは同じ合計（`expenses.totals`）に楽観的更新の分を足して渡すので、答えは必ず一致する。
 */
export function settlementsOf(totals: ExpenseTotal[]): Settlement[] {
  const net = new Map<string | null, number>();
  const add = (party: string | null, delta: number) =>
    net.set(party, (net.get(party) ?? 0) + delta);
  for (const t of totals) {
    add(t.fromUserId, t.amount);
    add(t.toUserId, -t.amount);
  }
  const nets = [...net].map(([party, amount]): Net => ({ party, amount }));
  const byAmount = (x: Net, y: Net) => y.amount - x.amount || compareParty(x.party, y.party);
  const creditors = nets.filter((n) => n.amount > 0).sort(byAmount);
  const debtors = nets
    .filter((n) => n.amount < 0)
    .map((n) => ({ ...n, amount: -n.amount }))
    .sort(byAmount);

  const settlements: Settlement[] = [];
  let creditor = creditors.shift();
  let debtor = debtors.shift();
  while (creditor && debtor) {
    const amount = Math.min(creditor.amount, debtor.amount);
    settlements.push({ creditorId: creditor.party, debtorId: debtor.party, amount });
    creditor.amount -= amount;
    debtor.amount -= amount;
    if (creditor.amount === 0) creditor = creditors.shift();
    if (debtor.amount === 0) debtor = debtors.shift();
  }
  return settlements.sort(
    (x, y) =>
      y.amount - x.amount ||
      compareParty(x.creditorId, y.creditorId) ||
      compareParty(x.debtorId, y.debtorId),
  );
}

/** 当事者 1 人（null は共有）の正味の債権（正）・債務（負）。突き合わせの間は大きさだけを持つ */
type Net = { party: string | null; amount: number };

/** 当事者の並び（ID の符号位置順、共有が先）。サーバーとクライアントで並びを揺らさない（`compareKeys`） */
function compareParty(x: string | null, y: string | null): number {
  return compareKeys(x ?? '', y ?? '');
}
