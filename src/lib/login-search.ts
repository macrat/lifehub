import { z } from 'zod';

// OAuth の署名付きクエリは保持し、アプリの戻り先だけを同一オリジンのパスに制限する。
export const loginSearchSchema = z.looseObject({
  redirect: z
    .string()
    .refine((value) => {
      // biome-ignore lint/suspicious/noControlCharactersInRegex: URL パーサーが無視する制御文字を明示的に拒否する
      if (!value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value))
        return false;
      return new URL(value, 'https://lifehub.invalid').origin === 'https://lifehub.invalid';
    })
    .catch('/')
    .optional(),
});
