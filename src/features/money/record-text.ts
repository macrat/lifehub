import type { MoneyRecord } from '../../../shared/money.ts';
import { formatSignedYen, formatYen } from '../../lib/yen.ts';
import { partiesInOrder, partiesLabel } from './parties.ts';

/** お金の記録の金額の表示。手で入れた立替は額だけ、取り込んだ入出金は入金に + を付ける */
export function recordAmount(record: MoneyRecord): string {
  return record.account === null ? formatYen(record.amount) : formatSignedYen(record.amount);
}

/**
 * お金の記録が誰の物か（お金の画面の一覧の補足、タイムラインの見出し）。手で入れた立替は当事者の名前
 * （`partiesInOrder` の並び）、取り込んだ入出金は金融機関
 */
export function recordOwner(record: MoneyRecord, label: (party: string | null) => string): string {
  return record.account ?? partiesLabel(partiesInOrder(record), label);
}
