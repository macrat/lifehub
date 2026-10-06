import { addCalendarMonths, addDays } from './date.ts';
import { compareKeys } from './sort.ts';
import type { DateString } from './types.ts';

/**
 * お金の記録（手で入れた立替と、Money Forward から取り込んだ入出金）と、そこから導く精算、立替スケジュール、
 * 取り込む口座と取り込みルール。サーバーの一覧・精算と、クライアントの表示・楽観的更新が同じ形と式を使うため、共通に置く。
 */

/**
 * お金の記録 1 件（表 `money_records` の 1 行）。手で入れた立替と、Money Forward から取り込んだ入出金を同じ形で持つ。
 * - 当事者（From・To）: from が to のために amount 円を払い、from に債権、to に債務が生じた。null は共有（共有口座）。
 *   手で入れた立替は必ずどちらかを持つ。取り込んだ入出金は取り込みルールで「共有」との立替にしたものだけが持ち、
 *   どちらも null ならただの支出（精算に入れない。`partiesOf`）
 * - 金額: 手で入れた立替は正の数。取り込んだ入出金は入金が正・出金が負（精算では大きさを使う）
 * - account: 取り込んだ金融機関の名前。null は手で入れた立替（直せるのはこちらだけ。取り込んだものは取り込みルールで読み替える）
 */
export type MoneyRecord = {
  id: string;
  fromUserId: string | null;
  toUserId: string | null;
  amount: number;
  description: string;
  occurredOn: DateString;
  createdAt: string;
  account: string | null;
};

/** 立替の当事者（null は共有）。From は払った人（債権者）、To は誰のために払ったか（債務者） */
export type Parties = { fromUserId: string | null; toUserId: string | null };

/** 当事者を持つか。どちらも null（ただの支出の入出金）なら持たず、精算に入らない */
export function hasParties({ fromUserId, toUserId }: Parties): boolean {
  return fromUserId !== null || toUserId !== null;
}

/**
 * 並び: 日の古い順（一覧は画面で逆さに出す）。同じ日の中は記録した順（取り込んだ入出金は最初に取り込んだ時刻）。
 * サーバーの問い合わせ（`server/features/money/repository.ts` の `findPage`）と同じ並びで、
 * サーバーとクライアントで揺らさないよう符号位置で比べる（`compareKeys`）
 */
export function sortMoneyRecords(records: MoneyRecord[]): MoneyRecord[] {
  return records.toSorted(
    (a, b) =>
      compareKeys(a.occurredOn, b.occurredOn) ||
      compareKeys(a.createdAt, b.createdAt) ||
      compareKeys(a.id, b.id),
  );
}

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
export type ExpenseTotal = Parties & { amount: number };

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
 * クライアントは同じ合計（`money.totals`）に楽観的更新の分を足して渡すので、答えは必ず一致する。
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

/**
 * 取り込む口座の種類（サーバーの環境変数 `MONEYFORWARD_ACCOUNTS` で口座ごとに指定する）。
 * 種類でお金の画面のカードに出す値が変わる: 銀行は残高、証券は評価額、クレジットカードは次回の引き落とし。
 */
export const MONEY_ACCOUNT_KINDS = ['bank', 'securities', 'card'] as const;
type MoneyAccountKind = (typeof MONEY_ACCOUNT_KINDS)[number];

/** お金の画面のカード 1 枚。並びは環境変数に書いた順 */
export type MoneyAccount = {
  /** Money Forward での金融機関の名前（環境変数に書いた名前） */
  name: string;
  kind: MoneyAccountKind;
  /** 銀行の残高・証券の評価額（円）。クレジットカード、まだ取り込んでいない、または読めなかったら null */
  balance: number | null;
  /** クレジットカードの次回の引き落とし額（円）。カード以外、または読めなかったら null */
  withdrawalAmount: number | null;
  /** クレジットカードの次回の引き落とし日。カード以外、または読めなかったら null */
  withdrawalOn: DateString | null;
  /** 最後に取り込んだ日時（ISO）。まだ取り込んでいなければ null */
  fetchedAt: string | null;
};

/**
 * 口座の 1 日の値（残高の推移のグラフの 1 点）。amount は銀行なら残高、証券なら評価額、クレジットカードなら負債額
 * （使ってまだ払っていない額）を負の数で持つ。グラフでは負債を 0 より下へ積む
 */
export type MoneyBalance = { account: string; on: DateString; amount: number };

/** 日の古い順（推移の 1 ページの中の並び。`HistoryPage` は古い順） */
export function sortBalances(balances: MoneyBalance[]): MoneyBalance[] {
  return balances.toSorted((a, b) => compareKeys(a.on, b.on) || compareKeys(a.account, b.account));
}

/**
 * 入出金の読み替えのルールの種別。spending はただの支出（精算に入れない）、deposit（入金）と withdrawal（出金）は
 * 対象者と「共有」との立替として精算に入れる: 入金は対象者が共有口座へ入れた（From 対象者 → To 共有）、
 * 出金は対象者が共有口座から引き出した（From 共有 → To 対象者）
 */
export const MONEY_RULE_KINDS = ['spending', 'deposit', 'withdrawal'] as const;
export type MoneyRuleKind = (typeof MONEY_RULE_KINDS)[number];

/**
 * 内容欄全体と一致させる正規表現。パターンを `(?:…)` で包んでから `^` と `$` を付けるので、`a|b` のような選択も
 * 全体に掛かる（そのまま付けると `^a|b$` になり、a で始まるか b で終わるだけで当たる）
 */
export function fullMatch(pattern: string): RegExp {
  return new RegExp(`^(?:${pattern})$`);
}

/**
 * 取り込みルールに当たった入出金の当事者。入金（対象者が共有口座へ入れた）は 対象者 → 共有、
 * 出金（対象者が共有口座から引き出した）は 共有 → 対象者、支出はどちらも持たない（ただの支出）
 */
export function ruleParties({
  kind,
  userId,
}: {
  kind: MoneyRuleKind;
  userId: string | null;
}): Parties {
  if (kind === 'spending' || userId === null) return { fromUserId: null, toUserId: null };
  return kind === 'deposit'
    ? { fromUserId: userId, toUserId: null }
    : { fromUserId: null, toUserId: userId };
}
