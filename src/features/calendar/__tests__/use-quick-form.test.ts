import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '../../../lib/__tests__/render-hook.ts';
import { type DraftChange, type GridDraft, itemDraft } from '../draft.ts';
import { taskTimesOf } from '../task-draft.ts';
import { useQuickForm } from '../use-quick-form.ts';
import { allDay, DAY, event, task } from './draft-fixtures.ts';

/** 下書きでフックを描き、描き直す関数・最新の戻り値・下書きへ戻した変更を受け取る */
function setup(draft: GridDraft) {
  const onChangeDraft = vi.fn<(change: DraftChange) => void>();
  const { read, rerender } = renderHook(
    (current: GridDraft) =>
      useQuickForm({
        draft: current,
        onSubmit: vi.fn(),
        onChangeDraft,
        onSwitchKind: vi.fn(),
        onClose: vi.fn(),
      }),
    { props: draft },
  );
  return { read, rerender, onChangeDraft };
}

const base = { participantIds: ['u1'], settled: true, origin: 'grid' as const };
const frame = itemDraft(task) ?? allDay(DAY, DAY);
/** つまんだタスクの下書き */
const taskDraft: GridDraft = { ...base, task: taskTimesOf(task, frame), range: frame, item: task };

describe('useQuickForm', () => {
  it('既定値は下書きから導き、参加者は選んだものになる', () => {
    const { read, rerender } = setup(taskDraft);
    expect(read().initial).toMatchObject({ title: task.title, startsAt: task.startsAt });
    rerender({ ...taskDraft, participantIds: ['u1', 'u2'] });
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
    const { read, rerender } = setup({ ...base, task: null, range, item: event });
    expect(read().allDay).toBe(false);
    rerender({ ...base, task: null, range: allDay(DAY, DAY), item: event });
    expect(read().allDay).toBe(true);
  });

  it('タスクから予定に切り替えた下書きは、期限前の通知を持ち越さない', () => {
    const { read } = setup({
      ...base,
      task: null,
      range: { allDay: false, date: DAY, startMin: 540, endMin: 600 },
      item: task,
    });
    expect(read().initial).toMatchObject({ title: task.title, remindEndMinutes: null });
  });
});
