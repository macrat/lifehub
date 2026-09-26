import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { itemDraft } from '../draft.ts';
import type { TaskGridDraft } from '../use-event-composer.ts';
import { useQuickTaskForm } from '../use-quick-task-form.ts';
import { allDay, DAY, task } from './draft-fixtures.ts';

// React の act を使う（テスト用の描画ライブラリは入れていない）
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let unmount: () => void = () => {};
afterEach(() => unmount());

/** つまんだタスクの下書きでフックを描き、描き直す関数と最新の戻り値を受け取る */
function setup(draft: TaskGridDraft) {
  let quick!: ReturnType<typeof useQuickTaskForm>;
  function Probe({ draft }: { draft: TaskGridDraft }) {
    quick = useQuickTaskForm({
      draft,
      onSubmit: vi.fn(),
      onChangeDraft: vi.fn(),
      onClose: vi.fn(),
    });
    return null;
  }
  const root = createRoot(document.createElement('div'));
  const render = (next: TaskGridDraft) =>
    act(() => root.render(createElement(Probe, { draft: next })));
  render(draft);
  unmount = () => act(() => root.unmount());
  return { read: () => quick, render };
}

const draft: TaskGridDraft = {
  range: itemDraft(task) ?? allDay(DAY, DAY),
  item: task,
  participantIds: ['u1'],
  settled: true,
  origin: 'grid',
};

describe('useQuickTaskForm', () => {
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
