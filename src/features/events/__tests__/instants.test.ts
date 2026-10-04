import { describe, expect, it } from 'vitest';
import { normalizeIsoInstants, toInputIsoInstants } from '../instants.ts';

describe('normalizeIsoInstants / toInputIsoInstants', () => {
  it('終日は入力の「含む最終日」と保存の「翌日 0:00」を行き来する。終了の無いものは null のまま', () => {
    // 9/21〜9/22 の終日（JST）
    const input = { startsAt: '2026-09-20T15:00:00.000Z', endsAt: '2026-09-21T15:00:00.000Z' };
    const saved = normalizeIsoInstants(true, input.startsAt, input.endsAt);
    expect(saved).toEqual({ startsAt: input.startsAt, endsAt: '2026-09-22T15:00:00.000Z' });
    expect(toInputIsoInstants(true, saved.startsAt, saved.endsAt)).toEqual({
      startsAt: input.startsAt,
      endsAt: '2026-09-22T14:59:59.999Z',
    });
    expect(normalizeIsoInstants(true, input.startsAt, null)).toEqual({
      startsAt: input.startsAt,
      endsAt: null,
    });
  });

  it('時間指定はそのまま', () => {
    const at = '2026-09-21T01:23:00.000Z';
    expect(normalizeIsoInstants(false, at, null)).toEqual({ startsAt: at, endsAt: null });
    expect(toInputIsoInstants(false, at, at)).toEqual({ startsAt: at, endsAt: at });
  });
});
