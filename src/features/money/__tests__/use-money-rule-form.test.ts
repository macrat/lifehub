import { act, type FormEvent } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import type { MoneyRule } from '../../../../shared/validation/money.ts';
import { renderHook } from '../../../lib/__tests__/render-hook.ts';
import { queryClient } from '../../../lib/query-client.ts';
import { useMoneyRuleForm } from '../use-money-rule-form.ts';

afterEach(() => queryClient.clear());

const RULE: MoneyRule = {
  id: '01900000-0000-7000-8000-000000000001',
  pattern: 'AMAZON',
  replaceDescription: true,
  replacement: 'Amazon',
  kind: 'spending',
  userId: null,
  hidden: false,
};

/** 欄の値を持つフォームを送る（無効な欄は送られないので、渡さなければ欄ごと無い） */
function submitEvent(fields: Record<string, string>): FormEvent<HTMLFormElement> {
  const form = document.createElement('form');
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.name = name;
    input.value = value;
    form.append(input);
  }
  return { preventDefault: () => {}, currentTarget: form } as unknown as FormEvent<HTMLFormElement>;
}

function renderForm() {
  const onSubmit = vi.fn(async () => {});
  const noop = () => {};
  const { read } = renderHook(
    () => useMoneyRuleForm({ rule: RULE, onSubmit, onDelete: noop, onClose: noop }),
    { client: queryClient },
  );
  return { read, onSubmit };
}

test('置換したまま置換後の内容欄を空にすると、前の値で保存せず欄の誤りにする', async () => {
  const { read, onSubmit } = renderForm();
  await act(() => read().sheet.onSubmit(submitEvent({ pattern: 'AMAZON', replacement: '' })));
  expect(onSubmit).not.toHaveBeenCalled();
  expect(read().fields.errors.replacement).toBe('置換後の内容欄を入力してください');
});

test('置換をやめると欄は送られないが、前の置換後の内容欄は残す', async () => {
  const { read, onSubmit } = renderForm();
  act(() => read().fields.setReplace(false));
  await act(() => read().sheet.onSubmit(submitEvent({ pattern: 'AMAZON' })));
  expect(onSubmit).toHaveBeenCalledWith({
    ...RULE,
    replaceDescription: false,
    replacement: 'Amazon',
  });
});
