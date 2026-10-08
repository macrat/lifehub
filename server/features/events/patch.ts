import { switchedEnds, toInputInstants } from '../../../shared/calendar.ts';
import {
  type EventPatch,
  type EventValues,
  eventRulesSchema,
} from '../../../shared/validation/events.ts';
import { ValidationError } from '../../lib/errors.ts';
import { applyPatch } from '../../lib/patch.ts';
import type { EventWithParticipants } from './repository.ts';
import { occurrenceRowOf, type Target } from './targets.ts';

/**
 * 一部の項目だけを変える更新（MCP。`applyPatch`）の、重ねた後の値。patch で undefined の項目は今の値のまま。
 * 種別を変えるときは、今の値を切り替えた種別の値に直してから重ねる（`switchedKind`）。
 * 予定の開始だけが指定されたら、終了も同じだけずらす（`keepDuration`）。
 * 終日と時刻ありを切り替えるときは、日時を持つ端をすべて指定させる（`requireBothEnds`）。
 * 繰り返し元と対象の回は呼ぶ側（`service.ts` の `patchEvent`）が読んで確かめて渡し、書き込みにも同じものを使う。
 * WHY 規則を service から分ける: LLM の頼み方（開始だけ・種別だけ）に合わせた補い方で、
 * 画面の書き込み（全項目を送る）には要らない。
 */
export async function patchedInput(
  master: EventWithParticipants,
  target: Target,
  patch: EventPatch,
) {
  const current = switchedKind(await currentInput(master, target), patch);
  requireBothEnds(current, patch);
  return applyPatch(current, keepDuration(current, patch), eventRulesSchema);
}

/**
 * 種別を変える部分更新の、切り替えた後の今の値。終わりは画面の切り替えと同じ規則（`switchedEnds`。
 * patch に end があれば、後で重ねるそれになる）。開始は patch に渡されていればそれを引き継ぐ
 * （「このタスクを明日 10 時の予定にして」で、終了が 10 時の 1 時間後になるように）。
 */
function switchedKind(current: EventValues, patch: EventPatch): EventValues {
  const { kind } = patch;
  if (kind === undefined || kind === current.kind) return current;
  const allDay = patch.allDay ?? current.allDay;
  const startsAt = patch.startsAt ?? current.startsAt;
  return { ...current, allDay, startsAt, ...switchedEnds(kind, allDay, startsAt) };
}

/**
 * 終日と時刻ありを切り替える部分更新は、今の値が持つ日時（開始と、予定なら終了）をすべて指定させる。
 * WHY: 終日の日時は保存のときに 0:00 に丸める（`normalizeInstants`）ので、省いた端を今のまま残すと、
 * 「終了を日付にして」で開始の時刻が 0:00 に切り詰められるように、省いた項目が黙って変わる。
 */
function requireBothEnds(current: EventValues, patch: EventPatch): void {
  if (patch.allDay === undefined || patch.allDay === current.allDay) return;
  const omitted =
    patch.startsAt === undefined || (current.kind === 'event' && patch.endsAt === undefined);
  if (omitted) {
    throw new ValidationError(
      '終日と時刻ありを切り替えるときは、開始（予定なら終了も）を指定してください',
    );
  }
}

/**
 * 予定の開始だけを変える部分更新は、長さを保って終了もずらす（予定を動かす）。
 * WHY: 「3 時からにして」を頼まれた LLM は終了を渡さないことが多く、終了を今のままにすると
 * 開始が終了を追い越して規則の誤りになるか、予定が意図せず伸び縮みする。
 * 終日と時刻ありの切り替えでは両端が指定されている（`requireBothEnds`）ので、ここには来ない。
 */
function keepDuration(current: EventValues, patch: EventPatch): EventPatch {
  const { startsAt, endsAt } = current;
  // 終了を持つのは予定だけ（平らな値なので、終了の有無で絞る）
  if (!endsAt || !patch.startsAt || patch.endsAt !== undefined) return patch;
  const duration = endsAt.getTime() - startsAt.getTime();
  return { ...patch, endsAt: new Date(patch.startsAt.getTime() + duration) };
}

/**
 * 書き込みの対象の今の値を、作成・更新の入力の項目で返す（種別で分ける前の平らな値。分けるのは規則を掛ける所）。
 * all は繰り返し元。this / following はその回（実体化されていればその行、無ければ繰り返し元をずらした値）。
 * 繰り返し元の値で埋めると、回の日時が最初の回の日時に戻ってしまう。
 */
async function currentInput(master: EventWithParticipants, target: Target): Promise<EventValues> {
  const row =
    target.scope === 'all' ? master : await occurrenceRowOf(master, target.occurrenceStart);
  return {
    kind: master.kind,
    title: row.title,
    allDay: row.allDay,
    ...toInputInstants(row.allDay, row.startsAt, row.endsAt),
    participantIds: row.participantIds,
    location: row.location,
    note: row.note,
    rrule: master.rrule,
    remindStartMinutes: row.remindStartMinutes,
    remindEndMinutes: row.remindEndMinutes,
  };
}
