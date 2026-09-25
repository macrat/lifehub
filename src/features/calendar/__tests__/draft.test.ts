import { describe, expect, it } from 'vitest';
import { jst } from '../../../../shared/__tests__/jst.ts';
import {
  draftText,
  draftValues,
  itemDraft,
  nextHourDraft,
  sameOccurrence,
  withAllDay,
} from '../draft.ts';
import { allDay, at, DAY, day, event, select, task, timed } from './draft-fixtures.ts';

describe('draftText', () => {
  it('時間指定は日付と時間帯', () => {
    expect(draftText(select(at(15 * 60), at(16 * 60), true))).toBe('6/5(木) 15:00〜16:15');
  });

  it('終日は日付（複数日なら両端）と「終日」', () => {
    expect(draftText(allDay(DAY, DAY))).toBe('6/5(木) 終日');
    expect(draftText(allDay(DAY, '2031-06-07'))).toBe('6/5(木)〜6/7(土) 終日');
  });
});

describe('nextHourDraft', () => {
  it('現在時刻の分を切り上げた正時から 1 時間', () => {
    expect(nextHourDraft(DAY, jst('2026-09-21T17:11:00'))).toEqual({
      allDay: false,
      date: DAY,
      startMin: 18 * 60,
      endMin: 19 * 60,
    });
  });

  it('ちょうど正時なら切り上げない', () => {
    expect(nextHourDraft(DAY, jst('2026-09-21T17:00:00'))).toMatchObject({ startMin: 17 * 60 });
  });

  it('切り上げが日をまたぐときは、枠に出せる最後の 1 時間にする', () => {
    expect(nextHourDraft(DAY, jst('2026-09-21T23:30:00'))).toMatchObject({
      startMin: 23 * 60,
      endMin: 24 * 60,
    });
  });
});

describe('withAllDay', () => {
  const now = new Date('2026-09-21T17:11:00+09:00');

  it('時間指定を終日にするとその日 1 日になる', () => {
    expect(withAllDay(timed, true, now)).toEqual(allDay('2031-06-05', '2031-06-05'));
  });

  it('終日を時間指定にすると、最初の日の既定の時間帯（次の正時から 1 時間）になる', () => {
    expect(withAllDay(allDay('2031-06-05', '2031-06-07'), false, now)).toEqual({
      allDay: false,
      date: DAY,
      startMin: 18 * 60,
      endMin: 19 * 60,
    });
  });

  it('同じ種類ならそのまま', () => {
    expect(withAllDay(timed, false, now)).toBe(timed);
  });
});

describe('draftValues', () => {
  it('追加のときは日時と参加者だけの空の予定', () => {
    expect(draftValues(timed, ['u1'])).toMatchObject({
      title: '',
      allDay: false,
      // `timed` は 9:00〜10:15（なぞって触れた 15 分の枠まで含む）
      startsAt: '2031-06-05T00:00:00.000Z',
      endsAt: '2031-06-05T01:15:00.000Z',
      participantIds: ['u1'],
      location: null,
      rrule: null,
    });
  });

  it('直している予定があるときは、その内容に枠の日時と参加者だけを重ねる', () => {
    expect(
      draftValues({ ...timed, startMin: 13 * 60, endMin: 14 * 60 }, ['u2'], event),
    ).toMatchObject({
      title: '打ち合わせ',
      location: '会議室',
      note: 'メモ',
      rrule: 'FREQ=WEEKLY',
      remindStartMinutes: 10,
      allDay: false,
      startsAt: '2031-06-05T04:00:00.000Z',
      endsAt: '2031-06-05T05:00:00.000Z',
      participantIds: ['u2'],
    });
  });

  it('終日にすると日だけの日時になる（直している内容はそのまま）', () => {
    expect(draftValues(allDay('2031-06-05', '2031-06-06'), ['u1'], event)).toMatchObject({
      title: '打ち合わせ',
      allDay: true,
      // 終日の終わりは翌日 0:00（JST）
      startsAt: '2031-06-04T15:00:00.000Z',
      endsAt: '2031-06-06T15:00:00.000Z',
    });
  });
});

describe('itemDraft', () => {
  it('単日の時間指定の予定はその日の時間帯', () => {
    expect(itemDraft(event)).toEqual({ allDay: false, date: DAY, startMin: 540, endMin: 600 });
  });

  it('24:00 に終わる予定は翌日 0:00 で届くので 24 時に読み替える', () => {
    expect(
      itemDraft({
        ...event,
        startsAt: '2031-06-05T13:00:00.000Z',
        endsAt: '2031-06-05T15:00:00.000Z',
      }),
    ).toMatchObject({ startMin: 22 * 60, endMin: 24 * 60 });
  });

  it('複数日の終日の予定は、日ごとに分かれた項目からでも全体の期間になる', () => {
    // 6/5 0:00〜6/9 0:00（排他的）の 4 日間を、その 3 日目の項目からつまむ
    expect(
      itemDraft({
        ...event,
        allDay: true,
        startsAt: '2031-06-04T15:00:00.000Z',
        endsAt: '2031-06-08T15:00:00.000Z',
        placementDate: day('2031-06-07'),
        dayIndex: 3,
        dayCount: 4,
      }),
    ).toEqual({ allDay: true, from: day('2031-06-05'), to: day('2031-06-08') });
  });

  it('枠に出せない項目（日をまたぐ時間指定の予定・完了したタスク）はつまめない', () => {
    expect(itemDraft({ ...event, dayCount: 2 })).toBeNull();
    expect(itemDraft({ ...task, completedAt: '2031-06-05T10:00:00.000Z' })).toBeNull();
  });

  it('時刻を持つタスクは、時間軸に置かれた時刻（開始）の最小の長さの枠', () => {
    expect(itemDraft(task)).toEqual({ allDay: false, date: DAY, startMin: 540, endMin: 570 });
  });

  it('日の終わり近くのタスクの枠は 24 時で切る', () => {
    expect(itemDraft({ ...task, startsAt: '2031-06-05T14:50:00.000Z' })).toMatchObject({
      startMin: 23 * 60 + 50,
      endMin: 24 * 60,
    });
  });

  it('時間軸に置けないタスク（日時なし・別の日の期限だけ）は置かれた日 1 日', () => {
    expect(itemDraft({ ...task, startsAt: null, endsAt: null })).toEqual(allDay(DAY, DAY));
    expect(itemDraft({ ...task, startsAt: null, endsAt: '2031-06-07T09:00:00.000Z' })).toEqual(
      allDay(DAY, DAY),
    );
  });
});

describe('sameOccurrence', () => {
  it('同じ発生なら、日ごとに分かれた項目でも同じ', () => {
    expect(sameOccurrence(event, { ...event, placementDate: day('2031-06-06'), dayIndex: 2 })).toBe(
      true,
    );
  });

  it('繰り返しの別の回・別の予定は違う', () => {
    expect(sameOccurrence(event, { ...event, occurrenceStart: '2031-06-12T00:00:00.000Z' })).toBe(
      false,
    );
    expect(sameOccurrence(event, { ...event, id: 'e2' })).toBe(false);
  });

  it('どちらも無ければ（追加の下書きどうし）同じ、片方だけなら違う', () => {
    expect(sameOccurrence(null, null)).toBe(true);
    expect(sameOccurrence(event, null)).toBe(false);
  });
});
