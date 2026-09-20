import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { createExpenseSchema } from '../../../../shared/validation/expenses.ts';
import { today } from '../../../lib/date.ts';
import { formSelect, formText, SELECT_NONE, useFormSubmit } from '../../../lib/form.ts';
import { FormDialog } from '../../../lib/ui/FormDialog.tsx';
import { useUserLabels } from '../../users/use-user-labels.ts';
import type { CreateExpenseBody } from '../queries.ts';

type Props = {
  onSubmit: (input: CreateExpenseBody) => Promise<unknown>;
  onClose: () => void;
};

/**
 * 立替の追加（借方・貸方）。To は誰のために払ったか（既定は共有 = 折半）、From は払った人
 * （既定はログイン中のユーザー）。精算は To に受け取った人、From に払った人を選んで記録する。
 */
export function ExpenseForm({ onSubmit, onClose }: Props) {
  const { options, meId } = useUserLabels();
  const people = options.filter((o) => o.value !== null);
  const { errors, submitError, submitting, handleSubmit } = useFormSubmit({
    schema: createExpenseSchema,
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
      title="立替を追加"
      onSubmit={handleSubmit}
      submitting={submitting}
      error={submitError}
    >
      <TextField
        name="amount"
        label="金額（円）"
        type="number"
        slotProps={{ htmlInput: { inputMode: 'numeric', min: 1, step: 1 } }}
        error={Boolean(errors.amount)}
        helperText={errors.amount}
        autoFocus
        fullWidth
      />
      <TextField
        name="description"
        label="内容"
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
          defaultValue={SELECT_NONE}
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
          defaultValue={meId ?? people[0]?.value ?? ''}
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
        defaultValue={today()}
        slotProps={{ inputLabel: { shrink: true } }}
        error={Boolean(errors.spentOn)}
        helperText={errors.spentOn}
        fullWidth
      />
    </FormDialog>
  );
}
