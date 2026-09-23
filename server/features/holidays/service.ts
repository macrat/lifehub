import ICAL from 'ical.js';
import type { DateString } from '../../../shared/types.ts';
import { dateStringSchema } from '../../../shared/validation/common.ts';
import * as repository from './repository.ts';

/**
 * 日本の祝日・休日の ics（webcal.jp）。法令・官報に基づいて振替休日と国民の休日まで載っており、
 * 数年先まで確定した分が配られる。
 * WHY NOT 祝日の計算を自前で持つ: 春分・秋分の日は官報で決まり、法改正や特例（五輪の年の移動など）も
 * あるので、規則を書いても追い続ける必要がある。
 */
const HOLIDAYS_URL = 'https://one.webcal.jp/JapanHolidays/';

async function fetchIcs(): Promise<string> {
  const res = await fetch(HOLIDAYS_URL);
  if (!res.ok) throw new Error(`holidays: ${HOLIDAYS_URL} returned ${res.status}`);
  return res.text();
}

/**
 * ics から祝日の日付を取り出す（昇順・重複なし）。
 * 配布元は毎年の祝日を RRULE（と EXDATE）で書いているので、解析と展開は ical.js に任せる。
 * どの祝日も 1 日で終わるので、各回の開始日だけを見る。
 */
export function parseHolidays(ics: string): DateString[] {
  const calendar = new ICAL.Component(ICAL.parse(ics));
  const dates = new Set<DateString>();
  for (const component of calendar.getAllSubcomponents('vevent')) {
    const iterator = new ICAL.Event(component).iterator();
    for (let time = iterator.next(); time; time = iterator.next()) {
      dates.add(dateStringSchema.parse(time.toString()));
    }
  }
  return [...dates].sort();
}

/**
 * 配布元から取り直して入れ替え、入れ替えた一覧を返す（月次の Cron）。
 * 取得や解析に失敗したら何も書かずに投げる（手元の一覧は前回のまま残る）。
 */
export async function refreshHolidays(
  load: () => Promise<string> = fetchIcs,
): Promise<DateString[]> {
  const dates = parseHolidays(await load());
  await repository.replaceAll(dates);
  return dates;
}

/**
 * 祝日の一覧（昇順）。まだ一度も取っていなければ（デプロイ直後など）その場で取ってから返す。
 * WHY: 月次の Cron だけに任せると、最初の実行まで祝日が 1 つも出ない。
 */
export async function listHolidays(load: () => Promise<string> = fetchIcs): Promise<DateString[]> {
  const dates = await repository.findAll();
  if (dates.length === 0) return refreshHolidays(load);
  return dates.map((date) => dateStringSchema.parse(date));
}
