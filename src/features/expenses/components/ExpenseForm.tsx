import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { expenseSchema } from '../../../../shared/validation/expenses.ts';
import { today } from '../../../lib/date.ts';
import { formSelect, formText, SELECT_NONE, useFormSubmit } from '../../../lib/form.ts';
import { FormDialog } from '../../../lib/ui/FormDialog.tsx';
import { useUserLabels } from '../../users/use-user-labels.ts';
import type { Expense, ExpenseBody } from '../queries.ts';

type Props = {
  /** 編集する立替。省略すると追加 */
  initial?: Expense;
  onSubmit: (input: ExpenseBody) => Promise<unknown>;
  onClose: () => void;
};

/**
 * 立替の追加・編集（借方・貸方）。To は誰のために払ったか（既定は共有 = 折半）、From は払った人
 * （既定はログイン中のユーザー）。精算は To に受け取った人、From に払った人を選んで記録する。
 */
export function ExpenseForm({ initial, onSubmit, onClose }: Props) {
  const { options, meId } = useUserLabels();
  const people = options.filter((o) => o.value !== null);
  const { errors, submitError, submitting, handleSubmit } = useFormSubmit({
    schema: expenseSchema,
    values: (fd) => ({
      fromUserId: formText(fd, 'fromUserId'),
      toUserId: formSelect(fd, 'toUserId'),
      amount: formText(fd, 'amount') === null ? undefined : Number(formText(fd, 'amount')),
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
      title={initial ? '立替を編集' : '立替を追加'}
      onSubmit={handleSubmit}
      submitting={submitting}
      error={submitError}
    >
      <TextField
        name="amount"
        label="金額（円）"
        type="number"
        defaultValue={initial?.amount ?? ''}
        slotProps={{ htmlInput: { inputMode: 'numeric', min: 1, step: 1 } }}
        error={Boolean(errors.amount)}
        helperText={errors.amount}
        autoFocus
        fullWidth
      />
      <TextField
        name="description"
        label="内容"
        defaultValue={initial?.description ?? ''}
        error={Boolean(errors.description)}
        helperText={errors.description}
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
        name="spentOn"
        label="日付"
        type="date"
        defaultValue={initial?.spentOn ?? today()}
        slotProps={{ inputLabel: { shrink: true } }}
        error={Boolean(errors.spentOn)}
        helperText={errors.spentOn}
        fullWidth
      />
    </FormDialog>
  );
}
