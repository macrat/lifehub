import { act, type FormEvent } from 'react';
import { expect, test, vi } from 'vitest';
import { z } from 'zod';
import { FormFieldError, useFormSubmit } from '../form.ts';
import { renderHook } from './render-hook.ts';

test('値を組み立てる途中の欄の誤り（FormFieldError）は、送らずにその欄の誤りとして出す', async () => {
  const onSubmit = vi.fn();
  const { read, unmount } = renderHook(() =>
    useFormSubmit({
      schema: z.object({}),
      values: () => {
        throw new FormFieldError('startsAt', '日付と時刻を入力してください');
      },
      onSubmit,
    }),
  );
  const event = {
    preventDefault: () => {},
    currentTarget: document.createElement('form'),
  } as unknown as FormEvent<HTMLFormElement>;
  await act(() => read().handleSubmit(event));
  expect(read().errors).toEqual({ startsAt: '日付と時刻を入力してください' });
  expect(onSubmit).not.toHaveBeenCalled();
  unmount();
});
