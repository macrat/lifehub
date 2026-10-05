import type { WrittenEvent } from '../../../shared/calendar.ts';
import type { OccurrenceTarget } from '../../../shared/validation/events.ts';
import { NotFoundError, ValidationError } from '../../lib/errors.ts';
import { occurrenceExists, shiftTo, toMaster } from './occurrences.ts';
import type { EventWithParticipants } from './repository.ts';
import * as repository from './repository.ts';
import type { NewEventRow } from './schema.ts';

/**
 * 書き込みの対象の指し方: 繰り返し元の読み出し、範囲（すべて・この回・これ以降）の読み替えと検証、
 * 回の行の読み出しと実体化、書いた結果を MCP Events で届ける形にすること。
 * 書き込み（`service.ts`）と部分更新の今の値（`patch.ts`）が使う。
 */

export async function findMaster(id: string): Promise<EventWithParticipants> {
  const row = await repository.findMasterById(id);
  if (!row) throw new NotFoundError('見つかりません');
  return row;
}

/**
 * 操作の対象。繰り返しの回を指す操作（this / following）は、繰り返しのルールと
 * ルール上に実在する回の基準日時を必ず持つ（実在しなければここで ValidationError にする）ので、
 * 呼び出し側は rrule が null かどうかを改めて確かめなくてよい。
 */
type Target =
  | { scope: 'all' }
  | { scope: 'this' | 'following'; rrule: string; occurrenceStart: Date };

/**
 * 指定された範囲を実際に行う操作に読み替え、回の指定を検証する。
 * - 単発は常に all（回が 1 つしかない）
 * - 先頭の発生に対する following は all と同じ（以降すべて = 全部）。先頭の基準日時は
 *   ルールに当てはまらないこともある（DTSTART が BYDAY に合わない）ので、実在の確認より先に見る
 */
export function resolveTarget(
  master: { rrule: string | null; startsAt: Date },
  target: OccurrenceTarget,
): Target {
  const { rrule } = master;
  if (!rrule || target.scope === 'all') return { scope: 'all' };
  const { scope, occurrenceStart } = target;
  if (scope === 'following' && occurrenceStart.getTime() === master.startsAt.getTime())
    return { scope: 'all' };
  if (!occurrenceExists(master, occurrenceStart)) throw new ValidationError('その回は存在しません');
  return { scope, rrule, occurrenceStart };
}

/** 繰り返しの回の行。実体化されていればその行、無ければ繰り返し元をその回へずらした値 */
export async function occurrenceRowOf(master: EventWithParticipants, occurrenceStart: Date) {
  return (
    (await repository.findOccurrence(master.id, occurrenceStart)) ?? {
      ...master,
      ...shiftTo(master, occurrenceStart),
    }
  );
}

/**
 * 繰り返しの回の今の値（MCP Events で届ける形）。実体化されていればその行、無ければ繰り返し元をずらした値で、
 * 一覧が回を出すときと同じく id と繰り返しは繰り返し元のもの（`buildOccurrence`）
 */
export async function occurrenceOf(
  master: EventWithParticipants,
  occurrenceStart: Date,
): Promise<WrittenEvent> {
  const row = await occurrenceRowOf(master, occurrenceStart);
  return {
    ...toMaster({ ...row, id: master.id, rrule: master.rrule }),
    occurrenceStart: occurrenceStart.toISOString(),
  };
}

/** 書いた行（回でないもの）を、書き込んだ予定・タスクの形にする */
export function writtenOf(row: Parameters<typeof toMaster>[0]): WrittenEvent {
  return { ...toMaster(row), occurrenceStart: null };
}

/**
 * 繰り返しの回を実体化する（無ければ繰り返し元の複製に values を重ねて作り、あれば values だけを当てる）。
 * 参加者は、指定があれば置き換え、新しく作るときは繰り返し元から複製する（`repository.materializeOccurrence`）。
 */
export async function materialize(
  master: EventWithParticipants,
  occurrenceStart: Date,
  values: Partial<NewEventRow>,
  participantIds: string[] | undefined,
  userId: string,
): Promise<{ completedAt: Date | null }> {
  const { id: _id, createdAt: _c, updatedAt: _u, participantIds: _p, ...copy } = master;
  return repository.materializeOccurrence(
    {
      ...copy,
      ...shiftTo(master, occurrenceStart),
      rrule: null,
      createdBy: userId,
      ...values,
      seriesId: master.id,
      occurrenceStart,
    },
    values,
    participantIds,
  );
}
