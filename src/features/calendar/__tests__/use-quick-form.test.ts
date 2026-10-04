import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type DraftChange, type GridDraft, itemDraft } from '../draft.ts';
import { newTaskTimes, taskTimesOf } from '../task-draft.ts';
import { useQuickForm } from '../use-quick-form.ts';
import { allDay, DAY, event, task } from './draft-fixtures.ts';

// React の act を使う（テスト用の描画ライブラリは入れていない）
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let unmount: () => void = () => {};
afterEach(() => unmount());

/** 下書きでフックを描き、描き直す関数・最新の戻り値・下書きへ戻した変更を受け取る */
function setup(draft: GridDraft) {
  let quick!: ReturnType<typeof useQuickForm>;
  const onChangeDraft = vi.fn<(change: DraftChange) => void>();
  function Probe({ draft }: { draft: GridDraft }) {
    quick = useQuickForm({
      draft,
      onSubmit: vi.fn(),
      onChangeDraft,
      onSwitchKind: vi.fn(),
      onClose: vi.fn(),
    });
    return null;
  }
  const root = createRoot(document.createElement('div'));
  const render = (next: GridDraft) => act(() => root.render(createElement(Probe, { draft: next })));
  render(draft);
  unmount = () => act(() => root.unmount());
  return { read: () => quick, render, onChangeDraft };
}

const base = { participantIds: ['u1'], settled: true, origin: 'grid' as const };
const frame = itemDraft(task) ?? allDay(DAY, DAY);
/** つまんだタスクの下書き */
const taskDraft: GridDraft = { ...base, task: taskTimesOf(task, frame), range: frame, item: task };

describe('useQuickForm', () => {
  it('既定値は下書きから導き、参加者は選んだものになる', () => {
    const { read, render } = setup(taskDraft);
    expect(read().initial).toMatchObject({ title: task.title, startsAt: task.startsAt });
    render({ ...taskDraft, participantIds: ['u1', 'u2'] });
    expect(read().initial.participantIds).toEqual(['u1', 'u2']);
  });

  it('終日は下書きが持ち、切り替えは下書きへ戻す（タスクは開始の所の 1 日の帯になる）', () => {
    const { read, onChangeDraft } = setup(taskDraft);
    expect(read().allDay).toBe(false);
    act(() => read().changeAllDay(true));
    expect(onChangeDraft).toHaveBeenCalledWith({
      task: expect.objectContaining({ allDay: true, frame: allDay(DAY, DAY) }),
    });
  });

  it('予定の終日は枠そのもので決まる', () => {
    const range = { allDay: false as const, date: DAY, startMin: 600, endMin: 660 };
    const { read, render } = setup({ ...base, task: null, range, item: event });
    expect(read().allDay).toBe(false);
    render({ ...base, task: null, range: allDay(DAY, DAY), item: event });
    expect(read().allDay).toBe(true);
  });

  it('予定からタスクに切り替えた下書きは、終了と終了前の通知を持ち越さない', () => {
    const range = { allDay: false as const, date: DAY, startMin: 540, endMin: 600 };
    const { read } = setup({
      ...base,
      task: newTaskTimes(range),
      range,
      item: { ...event, remindEndMinutes: 5 },
    });
    expect(read().initial).toMatchObject({
      title: event.title,
      endsAt: null,
      remindEndMinutes: null,
    });
  });
});
