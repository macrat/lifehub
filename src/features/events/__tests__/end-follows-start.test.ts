import { expect, test } from 'vitest';
import { endFollowsStart } from '../form-values.ts';

/** 日付と時刻に分けた開始・終了の欄を持つフォーム */
function form(start: [string, string], end: [string, string]) {
  const element = document.createElement('form');
  element.innerHTML = `
    <input name="startsAtDate" type="date" value="${start[0]}">
    <input name="startsAtTime" type="time" value="${start[1]}">
    <input name="endsAtDate" type="date" value="${end[0]}">
    <input name="endsAtTime" type="time" value="${end[1]}">`;
  const input = (name: string) => element.elements.namedItem(name) as HTMLInputElement;
  /** 欄の値を変えて、変更を知らせる */
  const change = (name: string, value: string) => {
    input(name).value = value;
    endFollowsStart({ target: input(name) } as Parameters<typeof endFollowsStart>[0]);
  };
  return { input, change };
}

test('開始の時刻を動かすと、終了は長さを保ったまま動く（日付をまたいでも）', () => {
  const { input, change } = form(['2030-02-04', '09:00'], ['2030-02-04', '10:00']);
  change('startsAtTime', '09:30');
  expect(input('endsAtTime').value).toBe('10:30');
  change('startsAtTime', '23:30');
  expect([input('endsAtDate').value, input('endsAtTime').value]).toEqual(['2030-02-05', '00:30']);
});

test('開始の日付を動かすと、終了の日付も同じだけ動く', () => {
  const { input, change } = form(['2030-02-04', '09:00'], ['2030-02-05', '10:00']);
  change('startsAtDate', '2030-02-10');
  expect([input('endsAtDate').value, input('endsAtTime').value]).toEqual(['2030-02-11', '10:00']);
});
