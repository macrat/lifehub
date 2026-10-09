import { useState } from 'react';
import type { z } from 'zod';
import { DEFAULT_HUE } from '../../../shared/color.ts';
import { formValues, useFormSubmit } from '../../lib/form.ts';
import type { User } from './queries.ts';

/**
 * ユーザーの登録・変更のフォーム（`UserForm`）の状態と保存。色はスライダーで選ぶので、FormData から読むのではなく
 * 状態として持つ。登録時は省略できる（サーバーが既存ユーザーと離れた色相を選ぶ）。編集時は今の色から始める。
 * `sheet` は `RecordSheet` にそのまま広げる。
 */
export function useUserForm<S extends z.ZodType>({
  user,
  schema,
  onSubmit,
  onClose,
}: {
  user: User | null;
  schema: S;
  onSubmit: (input: z.output<S>) => Promise<unknown>;
  onClose: () => void;
}) {
  const [hue, setHue] = useState<number | null>(user?.hue ?? null);
  const { errors, sheet } = useFormSubmit({
    schema,
    values: (fd) => ({ ...formValues(fd), hue: hue ?? undefined }),
    onSubmit,
    onSaved: onClose,
  });
  return {
    errors,
    sheet: { ...sheet, onClose },
    /** 色のスライダー（選んでいなければ既定の色相を指す） */
    hue: { value: hue ?? DEFAULT_HUE, onChange: setHue },
  };
}
