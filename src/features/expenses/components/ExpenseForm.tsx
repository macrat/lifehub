import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { type FormEvent, useState } from 'react';
import { createExpenseSchema } from '../../../../shared/validation/expenses.ts';
import { today } from '../../../lib/date.ts';
import { type FormErrors, parseValues } from '../../../lib/form.ts';
import { SubmitButton } from '../../../lib/ui/SubmitButton.tsx';
import { useOwnerLabel } from '../../users/use-owner-label.ts';
import type { CreateExpenseBody } from '../queries.ts';

type Props = {
  open: boolean;
  onSubmit: (input: CreateExpenseBody) => Promise<unknown>;
  onClose: () => void;
};

/** 立替の追加。支払者の既定は自分、日付の既定は今日。 */
export function ExpenseForm({ open, onSubmit, onClose }: Props) {
  const { options, meId } = useOwnerLabel();
  const payers = options.filter((o) => o.value !== null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const raw = {
      paidBy: fd.get('paidBy'),
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
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>立替を追加</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {submitError && <Alert severity="error">{submitError}</Alert>}
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
            <TextField
              name="paidBy"
              label="支払った人"
              select
              defaultValue={meId ?? payers[0]?.value ?? ''}
              error={Boolean(errors.paidBy)}
              helperText={errors.paidBy}
              fullWidth
            >
              {payers.map((o) => (
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
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>キャンセル</Button>
          <SubmitButton disabled={submitting} />
        </DialogActions>
      </form>
    </Dialog>
  );
}
