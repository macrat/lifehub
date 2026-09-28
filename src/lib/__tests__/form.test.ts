import { act, createElement, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { z } from 'zod';
import { FormFieldError, useFormSubmit } from '../form.ts';

// React の act を使う（テスト用の描画ライブラリは入れていない）
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test('値を組み立てる途中の欄の誤り（FormFieldError）は、送らずにその欄の誤りとして出す', async () => {
  const onSubmit = vi.fn();
  let form!: ReturnType<typeof useFormSubmit>;
  function Probe() {
    form = useFormSubmit({
      schema: z.object({}),
      values: () => {
        throw new FormFieldError('startsAt', '日付と時刻を入力してください');
      },
      onSubmit,
    });
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(createElement(Probe)));
  const event = {
    preventDefault: () => {},
    currentTarget: document.createElement('form'),
  } as unknown as FormEvent<HTMLFormElement>;
  await act(() => form.handleSubmit(event));
  expect(form.errors).toEqual({ startsAt: '日付と時刻を入力してください' });
  expect(onSubmit).not.toHaveBeenCalled();
  act(() => root.unmount());
});
