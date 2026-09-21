import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { expenseSchema } from '../../../../shared/validation/expenses.ts';
import { today } from '../../../lib/date.ts';
import { formSelect, formText, SELECT_NONE, useFormSubmit } from '../../../lib/form.ts';
import { FormDialog } from '../../../lib/ui/FormDialog.tsx';
import { useUserLabels } from '../../users/use-user-labels.ts';
import { evaluate, normalizeExpression, pressKey } from '../calculator.ts';
import type { Expense, ExpenseBody } from '../queries.ts';
import { Calculator } from './Calculator.tsx';

type Props = {
  /** 編集する立替。省略すると追加 */
  initial?: Expense;
  onSubmit: (input: ExpenseBody) => Promise<unknown>;
  onClose: () => void;
};

/**
 * 立替の追加・編集（借方・貸方）。To は誰のために払ったか（既定は共有 = 折半）、From は払った人
 * （既定はログイン中のユーザー）。精算は To に受け取った人、From に払った人を選んで記録する。
 * 上から日付・To/From・内容・金額と並べ、いちばん下の電卓で金額欄をそのまま計算する。
 */
export function ExpenseForm({ initial, onSubmit, onClose }: Props) {
  const { options, meId } = useUserLabels();
  const people = options.filter((o) => o.value !== null);
  // 金額欄の中身は電卓の式そのもの（"1200+800" など）。計算結果の置き場は別に持たない
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const { errors, submitError, submitting, handleSubmit } = useFormSubmit({
    schema: expenseSchema,
    values: (fd) => ({
      fromUserId: formText(fd, 'fromUserId'),
      toUserId: formSelect(fd, 'toUserId'),
      amount: evaluate(amount) ?? undefined,
      description: formText(fd, 'description') ?? '',
      spentOn: formText(fd, 'spentOn'),
    }),
    onSubmit,
    onSuccess: onClose,
  });

  return (
    <FormDialog
      onClose={onClose}
      maxWidth="xs"
      fill
      title={initial ? '立替を編集' : '立替を追加'}
      onSubmit={handleSubmit}
      submitting={submitting}
      error={submitError}
    >
      <TextField
        name="spentOn"
        label="日付"
        type="date"
        defaultValue={initial?.spentOn ?? today()}
        slotProps={{ inputLabel: { shrink: true } }}
        error={Boolean(errors.spentOn)}
        helperText={errors.spentOn}
        fullWidth
      />
      {/* 簿記に倣い To（貸方）を左、From（借方）を右に横並び */}
      <Stack direction="row" spacing={1}>
        <TextField
          name="toUserId"
          label="To"
          select
          defaultValue={initial?.toUserId ?? SELECT_NONE}
          error={Boolean(errors.toUserId)}
          helperText={errors.toUserId}
          fullWidth
        >
          <MenuItem value={SELECT_NONE}>共有</MenuItem>
          {people.map((o) => (
            <MenuItem key={o.value} value={o.value ?? ''}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          name="fromUserId"
          label="From"
          select
          defaultValue={initial?.fromUserId ?? meId ?? people[0]?.value ?? ''}
          error={Boolean(errors.fromUserId)}
          helperText={errors.fromUserId}
          fullWidth
        >
          {people.map((o) => (
            <MenuItem key={o.value} value={o.value ?? ''}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <TextField
        name="description"
        label="内容"
        defaultValue={initial?.description ?? ''}
        error={Boolean(errors.description)}
        helperText={errors.description}
        fullWidth
      />
      <TextField
        label="金額（円）"
        value={amount}
        onChange={(e) => setAmount(normalizeExpression(e.target.value))}
        // 画面の電卓で入力するので、タップしてもソフトキーボードは出さない（物理キーボードでは打てる）
        slotProps={{
          htmlInput: { inputMode: 'none', style: { textAlign: 'right', fontSize: '1.5rem' } },
        }}
        error={Boolean(errors.amount)}
        helperText={errors.amount}
        autoFocus
        fullWidth
      />
      <Calculator onPress={(key) => setAmount((current) => pressKey(current, key))} />
    </FormDialog>
  );
}
