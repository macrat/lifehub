import TextField from '@mui/material/TextField';
import {
  type CreateCalendarFeedInput,
  createCalendarFeedSchema,
} from '../../../../shared/validation/calendar-feeds.ts';
import { formValues, useFormSubmit } from '../../../lib/form.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';

type Props = {
  onClose: () => void;
  onSubmit: (input: CreateCalendarFeedInput) => Promise<unknown>;
};

/** 配信 URL の発行。決めるのは名前だけで、URL はサーバーが作って一覧に出る。 */
export function CalendarFeedForm({ onClose, onSubmit }: Props) {
  const { errors, submitError, submitted, handleSubmit } = useFormSubmit({
    schema: createCalendarFeedSchema,
    values: formValues,
    onSubmit,
    onSaved: onClose,
  });

  return (
    <RecordSheet
      open={!submitted}
      error={submitError}
      onClose={onClose}
      title="配信 URL を発行"
      onSubmit={handleSubmit}
    >
      <TextField
        name="name"
        label="名前"
        placeholder="スマホのカレンダー"
        error={Boolean(errors.name)}
        helperText={errors.name ?? '後から失効させるときに見分けるための名前'}
        autoFocus
        fullWidth
      />
    </RecordSheet>
  );
}
