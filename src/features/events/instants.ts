import { normalizeInstants, toInputInstants } from '../../../shared/calendar.ts';

/**
 * 保存形式と入力の形の日時の変換（`shared/calendar.ts` の `normalizeInstants` / `toInputInstants`）の
 * ISO 文字列版。クライアントは日時を ISO 文字列で持つので、Date との往復をここで済ませる。
 * WHY NOT shared に置く: サーバーは日時を Date で持ち、ISO 文字列版を使うのはクライアントだけ。
 * 規則そのもの（Date 版）は両方が使うので shared に残す。
 */

/** ISO 文字列で持つ日時の組（クライアントの入力・楽観的更新）。終了の無いもの（タスク）は null */
type IsoInstants = { startsAt: string; endsAt: string | null };

/** `normalizeInstants` の ISO 文字列版。終了を渡せば（予定）終了のある組が返る */
export function normalizeIsoInstants(
  allDay: boolean,
  startsAt: string,
  endsAt: string,
): { startsAt: string; endsAt: string };
export function normalizeIsoInstants(
  allDay: boolean,
  startsAt: string,
  endsAt: string | null,
): IsoInstants;
export function normalizeIsoInstants(
  allDay: boolean,
  startsAt: string,
  endsAt: string | null,
): IsoInstants {
  return onIso(normalizeInstants, allDay, startsAt, endsAt);
}

/** `toInputInstants` の ISO 文字列版 */
export function toInputIsoInstants(
  allDay: boolean,
  startsAt: string,
  endsAt: string | null,
): IsoInstants {
  return onIso(toInputInstants, allDay, startsAt, endsAt);
}

function onIso(
  convert: typeof normalizeInstants,
  allDay: boolean,
  startsAt: string,
  endsAt: string | null,
): IsoInstants {
  const result = convert(allDay, new Date(startsAt), endsAt === null ? null : new Date(endsAt));
  return {
    startsAt: result.startsAt.toISOString(),
    endsAt: result.endsAt?.toISOString() ?? null,
  };
}
