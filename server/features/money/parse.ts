import { parse } from 'csv-parse/sync';
import { isDateString } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';

/**
 * Money Forward から読んだものを、明細と口座の値にする。ブラウザを動かす `moneyforward.ts` は画面と CSV から
 * 文字を集めるだけにし、読み方はここに置く（ブラウザ無しで確かめられるように）。
 */

/** 入出金の CSV の列（見出しの名前で引くので、並びが変わっても読める） */
const COLUMNS = {
  date: '日付',
  description: '内容',
  amount: '金額（円）',
  account: '保有金融機関',
  transfer: '振替',
  id: 'ID',
} as const;

/** CSV から読んだ明細 1 件（内容欄は Money Forward のまま。読み替えは `rules.ts`） */
export type ParsedTransaction = {
  sourceId: string;
  account: string;
  occurredOn: DateString;
  originalDescription: string;
  amount: number;
};

/**
 * 家計簿の画面の振替の行 1 つ: 明細の ID と、保有金融機関の欄に並ぶ 2 つの口座の名前（振替の元と先。どちらが
 * この明細の口座かは問わない）
 */
export type TransferRow = { id: string; accounts: readonly string[] };

/**
 * 取り込む口座どうしの振替の明細の ID。振替の両側の口座がどちらも取り込む口座なら、口座から口座へ動いただけで支出でも
 * 収入でもないので取り込まない（カードの引き落としなら、銀行の出金とカードの利用の二重になる）。
 * 片側が取り込まない口座なら、取り込む口座から見れば出ていった・入ってきたお金なので取り込む（証券口座への入金、
 * 取り込まない口座で払うカードの引き落としなど）
 */
export function internalTransferIds(
  rows: readonly TransferRow[],
  accounts: readonly string[],
): Set<string> {
  return new Set(
    rows
      .filter(
        (row) =>
          row.accounts.length === 2 &&
          row.accounts.every((name) => matchAccount(name, accounts) !== undefined),
      )
      .map((row) => row.id),
  );
}

/**
 * 入出金の CSV（家計簿の「ダウンロード」。Shift_JIS を文字に直したもの）を明細の行にする。
 * accounts（取り込む口座の名前）に無い金融機関の明細と、取り込む口座どうしの振替（internalTransfers。
 * `internalTransferIds`）は除く。振替（「振替」の列が 1）でも、取り込まない口座との振替は残す。
 * WHY 振替の相手を CSV で決めない: CSV の「振替」の列は 0 か 1 だけで、相手の口座が載っていない。
 * 形の合わない行（日付・金額・ID が読めない）や列があれば投げる: 黙って飛ばすと、Money Forward の形が変わったときに
 * 明細が消えていくのに気づけない。
 */
export function parseTransactionsCsv(
  text: string,
  accounts: readonly string[],
  internalTransfers: ReadonlySet<string>,
): ParsedTransaction[] {
  const records: Record<string, string>[] = parse(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });
  return records.flatMap((record, index) => {
    const column = (name: string) => {
      const value = record[name];
      if (value === undefined) throw new Error(`moneyforward: CSV に「${name}」の列がありません`);
      return value.trim();
    };
    const account = matchAccount(column(COLUMNS.account), accounts);
    const sourceId = column(COLUMNS.id);
    if (!account || (column(COLUMNS.transfer) === '1' && internalTransfers.has(sourceId))) {
      return [];
    }
    const occurredOn = column(COLUMNS.date).replaceAll('/', '-');
    const amount = parseYen(column(COLUMNS.amount));
    if (!isDateString(occurredOn) || amount === null || sourceId === '') {
      // 見出しの行が 1 行目なので、記録の index 0 は 2 行目
      throw new Error(`moneyforward: CSV の ${index + 2} 行目が読めません`);
    }
    return [
      {
        sourceId,
        account,
        occurredOn,
        originalDescription: column(COLUMNS.description),
        amount,
      },
    ];
  });
}

/**
 * 画面や CSV の金融機関の名前を、取り込む口座の名前に引き当てる。口座の種別などが後ろに付くことがあるので
 * 前方一致で引き、いくつも合えば一番長い名前にする（「楽天カード」と「楽天カード（家族）」を取り違えない）。
 */
export function matchAccount(text: string, accounts: readonly string[]): string | undefined {
  const name = text.trim();
  return accounts
    .filter((account) => name.startsWith(account))
    .reduce<string | undefined>((a, b) => (a && a.length >= b.length ? a : b), undefined);
}

/** 金額の文字（「-3,200」「1,200円」「▲500」）を円の整数にする。数字が無ければ null（「未定」「-」） */
export function parseYen(text: string): number | null {
  const normalized = text.normalize('NFKC');
  const digits = normalized.replace(/[^\d]/g, '');
  if (digits === '') return null;
  const value = Number(digits);
  return /[-−▲]/.test(normalized) ? -value : value;
}

/** 家計簿の CSV のリンク（`/cf/csv?from=…&month=10&year=2026`）から、画面に出ている月（YYYY-MM）。読めなければ null */
export function parseCsvLinkMonth(href: string): string | null {
  const params = new URL(href, 'https://moneyforward.com').searchParams;
  const [year, month] = [Number(params.get('year')), Number(params.get('month'))];
  if (!Number.isInteger(year) || year < 1 || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** カードの詳細の見出し（「引き落とし予定額：42,000円」）から額を読む。未定や、見出しが無ければ null */
export function parseWithdrawalAmount(headings: readonly string[]): number | null {
  for (const heading of headings) {
    const match = heading.normalize('NFKC').match(/引き落とし予定額(?:合計)?:(.*)/);
    if (match) return parseYen(match[1] ?? '');
  }
  return null;
}

/** 引き落とし日の文字（「引き落とし日:(2026/10/27)」）から日付を読む。読めなければ null */
export function parseWithdrawalDate(text: string): DateString | null {
  const match = text.normalize('NFKC').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!match) return null;
  const value = `${match[1]}-${match[2]?.padStart(2, '0')}-${match[3]?.padStart(2, '0')}`;
  return isDateString(value) ? value : null;
}
