import { addCalendarMonths, addDays, today } from '../../../shared/date.ts';
import { newId } from '../../../shared/id.ts';
import {
  BALANCE_PAGE_MONTHS,
  type MoneyAccount,
  type MoneyBalance,
  sortBalances,
} from '../../../shared/money.ts';
import type { DateString, HistoryPage } from '../../../shared/types.ts';
import type { MoneyRule } from '../../../shared/validation/money.ts';
import { env, type MoneyForwardAccount } from '../../lib/env.ts';
import type { ParsedTransaction } from './parse.ts';
import { applyRules, type Rewritten } from './rules.ts';
import type { MoneyAccountRow, MoneyRuleRow } from './schema.ts';
import * as repository from './sync-repository.ts';

/**
 * Money Forward の取り込み: 口座の値と残高の推移、入出金の取り込み、取り込みルール。
 * 手で入れた立替と立替スケジュールは `service.ts`（ほかの feature と入口は service.ts から読む）。
 */

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

  const transactions = scraped.csvs.flatMap((csv) => parseTransactionsCsv(csv, accountNames));
  // 値を読んだ時刻（ブラウザで読むのに時間が掛かるので、始めた時刻ではなく読み終えた時刻）
  const saved = importOf(transactions, scraped.accounts, rules, today(now), new Date());
  await repository.saveImport(saved);
  return { records: saved.records.length, accounts: saved.accountRows.length };
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

/**
 * 読んだ明細と口座の値から、書くもの（`saveImport` の引数）を組み立てる。
 * 2 か月の CSV の境目で同じ明細が重なっても 1 行にする。内容欄は今のルールで読み替える（元のままの内容欄も持つ）。
 * 置き換える範囲は読んだ明細の最も古い日から最も新しい日まで（読めなければ null）。
 * 口座の値は recordedOn の日の記録としても残す。fetchedAt は値を読んだ時刻。
 */
function importOf(
  transactions: ParsedTransaction[],
  accounts: Omit<MoneyAccountRow, 'fetchedAt'>[],
  rules: MoneyRule[],
  recordedOn: DateString,
  fetchedAt: Date,
): Parameters<typeof repository.saveImport>[0] {
  const rewrite = applyRules(rules);
  const records = [
    ...new Map(
      transactions.map((row) => [
        row.sourceId,
        { ...row, ...rewrite(row.originalDescription), id: newId() },
      ]),
    ).values(),
  ];
  const days = records.map((row) => row.occurredOn).sort();
  const [from, to] = [days[0], days.at(-1)];
  return {
    accounts: accountNames,
    range: from && to ? { from, to } : null,
    records,
    accountRows: accounts.map((account) => ({ ...account, fetchedAt })),
    balanceRows: accounts.flatMap(({ name, balance }) =>
      balance === null
        ? []
        : [
            {
              account: name,
              recordedOn,
              balance: cardNames.has(name) ? -Math.abs(balance) : balance,
            },
          ],
    ),
  };
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
