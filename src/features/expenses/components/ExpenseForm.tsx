import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { type FormEvent, useState } from 'react';
import { createExpenseSchema } from '../../../../shared/validation/expenses.ts';
import { today } from '../../../lib/date.ts';
import { type FormErrors, parseValues } from '../../../lib/form.ts';
import { FormDialog } from '../../../lib/ui/FormDialog.tsx';
import { SubmitButton } from '../../../lib/ui/SubmitButton.tsx';
import { useOwnerLabel } from '../../users/use-owner-label.ts';
import type { CreateExpenseBody } from '../queries.ts';

type Props = {
  open: boolean;
  onSubmit: (input: CreateExpenseBody) => Promise<unknown>;
  onClose: () => void;
  /** 精算の記録など、初期値を差し込むとき */
  initial?: Partial<{
    amount: number;
    description: string;
    fromUserId: string;
    toUserId: string | null;
  }>;
};

const SHARED = 'shared';

/**
 * 立替の追加（借方・貸方）。From は払った人（既定はログイン中のユーザー）、To は誰のために払ったか
 * （既定は共有 = 折半）。精算は From に払った人、To に受け取った人を選んで記録する。
 */
export function ExpenseForm({ open, onSubmit, onClose, initial }: Props) {
  const { options, meId } = useOwnerLabel();
  const people = options.filter((o) => o.value !== null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const to = fd.get('toUserId');
    const raw = {
      fromUserId: fd.get('fromUserId'),
      toUserId: to === SHARED ? null : to,
      amount: fd.get('amount') === '' ? undefined : Number(fd.get('amount')),
      description: fd.get('description'),
      spentOn: fd.get('spentOn'),
    };
    const parsed = parseValues(createExpenseSchema, raw);
    if (parsed.errors) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setSubmitError(null);
    setSubmitting(true);
    try {
      await onSubmit(parsed.data);
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '保存に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      title="立替を追加"
      onSubmit={handleSubmit}
      actions={
        <>
          <Button onClick={onClose}>キャンセル</Button>
          <SubmitButton disabled={submitting} />
        </>
      }
    >
      <Stack spacing={2} sx={{ mt: 1 }}>
        {submitError && <Alert severity="error">{submitError}</Alert>}
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
        <TextField
          name="fromUserId"
          label="From（払った人）"
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
        <TextField
          name="toUserId"
          label="To（誰のために）"
          select
          defaultValue={initial?.toUserId === undefined ? SHARED : (initial.toUserId ?? SHARED)}
          error={Boolean(errors.toUserId)}
          helperText={errors.toUserId ?? '共有は折半。精算は受け取った人を選ぶ'}
          fullWidth
        >
          <MenuItem value={SHARED}>共有</MenuItem>
          {people.map((o) => (
            <MenuItem key={o.value} value={o.value ?? ''}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
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
      </Stack>
    </FormDialog>
  );
}
