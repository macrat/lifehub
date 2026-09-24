import TextField from '@mui/material/TextField';
import { type ApiKeyInput, apiKeySchema } from '../../../../shared/validation/api-keys.ts';
import { formValues, useFormSubmit } from '../../../lib/form.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';

type Props = {
  onClose: () => void;
  onSubmit: (input: ApiKeyInput) => Promise<unknown>;
};

/** API キーの発行。決めるのは名前だけで、キーはサーバーが作る */
export function ApiKeyForm({ onClose, onSubmit }: Props) {
  const { errors, submitError, submitted, handleSubmit } = useFormSubmit({
    schema: apiKeySchema,
    values: formValues,
    onSubmit,
    onSaved: onClose,
  });

  return (
    <RecordSheet
      open={!submitted}
      error={submitError}
      onClose={onClose}
      title="API キーを発行"
      onSubmit={handleSubmit}
    >
      <TextField
        name="name"
        label="名前"
        placeholder="レモンのボタン"
        error={Boolean(errors.name)}
        helperText={errors.name}
        autoFocus
        fullWidth
      />
    </RecordSheet>
  );
}
