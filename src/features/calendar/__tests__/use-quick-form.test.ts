import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { itemDraft } from '../draft.ts';
import { taskTimesOf } from '../task-draft.ts';
import type { GridDraft } from '../use-event-composer.ts';
import { useQuickForm } from '../use-quick-form.ts';
import { allDay, DAY, event, task } from './draft-fixtures.ts';

// React の act を使う（テスト用の描画ライブラリは入れていない）
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let unmount: () => void = () => {};
afterEach(() => unmount());

/** 下書きでフックを描き、描き直す関数と最新の戻り値を受け取る */
function setup(draft: GridDraft) {
  let quick!: ReturnType<typeof useQuickForm>;
  function Probe({ draft }: { draft: GridDraft }) {
    quick = useQuickForm({
      draft,
      onSubmit: vi.fn(),
      onChangeDraft: vi.fn(),
      onSwitchKind: vi.fn(),
      onClose: vi.fn(),
    });
    return null;
  }
  const root = createRoot(document.createElement('div'));
  const render = (next: GridDraft) => act(() => root.render(createElement(Probe, { draft: next })));
  render(draft);
  unmount = () => act(() => root.unmount());
  return { read: () => quick, render };
}

const frame = itemDraft(task) ?? allDay(DAY, DAY);
/** つまんだタスクの下書き */
const draft: GridDraft = {
  kind: 'task',
  times: taskTimesOf(task, frame),
  range: frame,
  item: task,
  participantIds: ['u1'],
  settled: true,
  origin: 'grid',
};

describe('useQuickForm（タスク）', () => {
  it('参加者を選び直しても、切り替えた終日は戻らず、既定値の参加者は選んだものになる', () => {
    const { read, render } = setup(draft);
    act(() => read().changeAllDay(true));
    render({ ...draft, participantIds: ['u1', 'u2'] });
    expect(read().allDay).toBe(true);
    expect(read().initial.participantIds).toEqual(['u1', 'u2']);
  });

  it('枠を動かしたら、終日はその置き方に合わせ直す', () => {
    const { read, render } = setup(draft);
    act(() => read().changeAllDay(true));
    render({ ...draft, range: { allDay: false, date: DAY, startMin: 600, endMin: 630 } });
    expect(read().allDay).toBe(false);
  });
});

describe('useQuickForm（予定）', () => {
  it('終日は下書きの枠そのもので決まる', () => {
    const range = { allDay: false as const, date: DAY, startMin: 600, endMin: 660 };
    const { read, render } = setup({
      kind: 'event',
      range,
      item: event,
      participantIds: ['u1'],
      settled: true,
      origin: 'grid',
    });
    expect(read().allDay).toBe(false);
    render({
      kind: 'event',
      range: allDay(DAY, DAY),
      item: event,
      participantIds: ['u1'],
      settled: true,
      origin: 'grid',
    });
    expect(read().allDay).toBe(true);
  });

  it('タスクから予定に切り替えた下書きは、期限前の通知を持ち越さない', () => {
    const { read } = setup({
      kind: 'event',
      range: { allDay: false, date: DAY, startMin: 540, endMin: 600 },
      item: task,
      participantIds: ['u1'],
      settled: true,
      origin: 'grid',
    });
    expect(read().initial).toMatchObject({ title: task.title, remindEndMinutes: null });
  });
});
