import { describe, expect, it } from 'vitest';
import type { DateString } from '../../../../shared/types.ts';
import { dayDraft, dayGrab, dayVibration } from '../day-draft.ts';
import { type DraftRange, draftColumns, type KindedDraft } from '../draft.ts';
import {
  allDay,
  at,
  DAY,
  day,
  draggedDays,
  event,
  select,
  selectDays,
  task,
  timed,
} from './draft-fixtures.ts';

describe('dayDraft', () => {
  it('両端を含む期間になる', () => {
    expect(selectDays('2031-06-05', '2031-06-07')).toEqual(allDay('2031-06-05', '2031-06-07'));
  });

  it('遡ってドラッグしても同じ期間になる', () => {
    expect(selectDays('2031-06-07', '2031-06-05')).toEqual(allDay('2031-06-05', '2031-06-07'));
  });

  it('動かさずに離したときは押した日だけの期間', () => {
    expect(dayDraft({ grab: null, from: day(DAY), to: day(DAY), moved: false })).toEqual(
      allDay(DAY, DAY),
    );
  });
});

describe('dayGrab', () => {
  const draft = allDay('2031-06-05', '2031-06-07');
  /** 日の並びに出ている枠（追加の予定の下書き） */
  const shown = (range: DraftRange): KindedDraft => ({ range, item: null, kind: 'event' });

  it('最初の日の左半分は開始、最後の日の右半分は終了', () => {
    expect(dayGrab(shown(draft), day('2031-06-05'), 'left')).toEqual({
      kind: 'start',
      draft,
      item: null,
    });
    expect(dayGrab(shown(draft), day('2031-06-07'), 'right')).toEqual({
      kind: 'end',
      draft,
      item: null,
    });
  });

  it('それ以外の掛かっている所は帯そのもの', () => {
    const move = { kind: 'move', draft, item: null };
    expect(dayGrab(shown(draft), day('2031-06-05'), 'right')).toEqual(move);
    expect(dayGrab(shown(draft), day('2031-06-06'), 'left')).toEqual(move);
    expect(dayGrab(shown(draft), day('2031-06-07'), 'left')).toEqual(move);
  });

  it('1 日だけの下書きは左右の半分が開始・終了になる（中ほどは無い）', () => {
    const single = allDay(DAY, DAY);
    expect(dayGrab(shown(single), DAY, 'left')).toEqual({
      kind: 'start',
      draft: single,
      item: null,
    });
    expect(dayGrab(shown(single), DAY, 'right')).toEqual({
      kind: 'end',
      draft: single,
      item: null,
    });
  });

  it('時間指定の下書きは、その日のどこを押しても帯そのもの（時間帯は日の並びでは直せない）', () => {
    const move = { kind: 'move', draft: timed, item: null };
    expect(dayGrab(shown(timed), DAY, 'left')).toEqual(move);
    expect(dayGrab(shown(timed), DAY, 'right')).toEqual(move);
    expect(dayGrab(shown(timed), day('2031-06-06'), 'left')).toBeNull();
  });

  it('編集中の予定をつまんだときは、その予定を持ち回る', () => {
    expect(
      dayGrab({ range: draft, item: event, kind: 'event' }, day('2031-06-06'), 'left'),
    ).toEqual({
      kind: 'move',
      draft,
      item: event,
    });
  });

  it('タスクは長さを持たないので、1 日の帯でも左右どちらを押しても帯そのもの', () => {
    const single = allDay(DAY, DAY);
    const move = { kind: 'move', draft: single, item: task };
    expect(dayGrab({ range: single, item: task, kind: 'task' }, DAY, 'left')).toEqual(move);
    expect(dayGrab({ range: single, item: task, kind: 'task' }, DAY, 'right')).toEqual(move);
  });

  it('予定からタスクに切り替えた枠も、直している物に関わらずタスクとして帯そのもの', () => {
    const single = allDay(DAY, DAY);
    const move = { kind: 'move', draft: single, item: null };
    expect(dayGrab({ range: single, item: null, kind: 'task' }, DAY, 'left')).toEqual(move);
  });

  it('掛からない日・枠無しは掴まない', () => {
    expect(dayGrab(shown(draft), day('2031-06-04'), 'right')).toBeNull();
    expect(dayGrab(shown(draft), day('2031-06-08'), 'left')).toBeNull();
    expect(dayGrab(null, DAY, 'left')).toBeNull();
  });
});

describe('dayDraft（下書きをつまむ）', () => {
  const draft = allDay('2031-06-05', '2031-06-07');

  it('つまんだだけで動かしていなければそのまま', () => {
    expect(draggedDays({ kind: 'move', draft, item: null }, DAY, '2031-06-09', false)).toEqual(
      draft,
    );
  });

  it('開始をつまむと終了は動かない', () => {
    expect(draggedDays({ kind: 'start', draft, item: null }, '2031-06-05', '2031-06-03')).toEqual(
      allDay('2031-06-03', '2031-06-07'),
    );
  });

  it('開始は終了より後ろへ行けない（最短 1 日）', () => {
    expect(draggedDays({ kind: 'start', draft, item: null }, '2031-06-05', '2031-06-09')).toEqual(
      allDay('2031-06-07', '2031-06-07'),
    );
  });

  it('終了をつまむと開始は動かない', () => {
    expect(draggedDays({ kind: 'end', draft, item: null }, '2031-06-07', '2031-06-10')).toEqual(
      allDay('2031-06-05', '2031-06-10'),
    );
  });

  it('終了は開始より前へ行けない（最短 1 日）', () => {
    expect(draggedDays({ kind: 'end', draft, item: null }, '2031-06-07', '2031-06-01')).toEqual(
      allDay('2031-06-05', '2031-06-05'),
    );
  });

  it('帯そのものをつまむと日数を保ったまま動かした日数だけずれる', () => {
    expect(draggedDays({ kind: 'move', draft, item: null }, '2031-06-06', '2031-06-09')).toEqual(
      allDay('2031-06-08', '2031-06-10'),
    );
    expect(draggedDays({ kind: 'move', draft, item: null }, '2031-06-06', '2031-06-04')).toEqual(
      allDay('2031-06-03', '2031-06-05'),
    );
  });

  it('月グリッドで下の行へ動かすと 1 週間ぶんずれる', () => {
    expect(draggedDays({ kind: 'move', draft, item: null }, '2031-06-06', '2031-06-13')).toEqual(
      allDay('2031-06-12', '2031-06-14'),
    );
  });

  it('時間指定の下書きは時間帯を保ったまま日だけが動く', () => {
    expect(draggedDays({ kind: 'move', draft: timed, item: null }, DAY, '2031-06-12')).toEqual({
      ...timed,
      date: '2031-06-12',
    });
  });
});

describe('draftColumns', () => {
  const week = ['2031-06-02', '2031-06-03', '2031-06-04', '2031-06-05'] as DateString[];

  it('並んだ日のうち掛かっている列を返す', () => {
    const draft = allDay('2031-06-03', '2031-06-04');
    expect(draftColumns(draft, week)).toEqual({
      col: 1,
      span: 2,
      roundStart: true,
      roundEnd: true,
    });
  });

  it('表示の外にはみ出す分は切り詰める', () => {
    const draft = allDay('2031-05-30', '2031-06-03');
    // 前の週から続いている端は丸めない
    expect(draftColumns(draft, week)).toEqual({
      col: 0,
      span: 2,
      roundStart: false,
      roundEnd: true,
    });
  });

  it('時間指定の下書きはその日 1 日ぶんの列', () => {
    expect(draftColumns(select(at(540), at(540)), week)).toEqual({
      col: 3,
      span: 1,
      roundStart: true,
      roundEnd: true,
    });
  });

  it('掛からない週は null', () => {
    expect(draftColumns(allDay('2031-07-01', '2031-07-01'), week)).toBeNull();
    expect(
      draftColumns(select({ date: '2031-07-01' as DateString, min: 540 }, at(540)), week),
    ).toBeNull();
  });
});

describe('dayVibration', () => {
  it('選ぶ日が変わっていなければ震わせない', () => {
    expect(
      dayVibration(allDay('2031-06-05', '2031-06-06'), allDay('2031-06-05', '2031-06-06')),
    ).toBeNull();
  });

  it('日をまたいで端が動いたら震わせる', () => {
    expect(
      dayVibration(allDay('2031-06-05', '2031-06-05'), allDay('2031-06-05', '2031-06-06')),
    ).toBe(10);
    expect(
      dayVibration(allDay('2031-06-05', '2031-06-06'), allDay('2031-06-05', '2031-06-05')),
    ).toBe(10);
  });

  it('向きが変わって起点の側が動いたときも震わせる', () => {
    expect(
      dayVibration(allDay('2031-06-05', '2031-06-05'), allDay('2031-06-04', '2031-06-05')),
    ).toBe(10);
  });

  it('帯ごと動かしたときも、時間指定の下書きの日が変わったときも震わせる', () => {
    expect(
      dayVibration(allDay('2031-06-05', '2031-06-06'), allDay('2031-06-12', '2031-06-13')),
    ).toBe(10);
    expect(dayVibration(timed, { ...timed, date: day('2031-06-06') })).toBe(10);
    expect(dayVibration(timed, { ...timed, startMin: 8 * 60 })).toBeNull();
  });
});
