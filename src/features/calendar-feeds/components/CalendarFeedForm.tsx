import TextField from '@mui/material/TextField';
import {
  type CalendarFeedInput,
  calendarFeedSchema,
} from '../../../../shared/validation/calendar-feeds.ts';
import { formList, formValues, useFormSubmit } from '../../../lib/form.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import { ParticipantsField } from '../../users/components/ParticipantsField.tsx';
import { useUserLabels } from '../../users/use-user-labels.ts';
import type { CalendarFeed } from '../queries.ts';

type Props = {
  /** 変更する配信 URL。無ければ新しく発行する */
  feed?: CalendarFeed;
  onClose: () => void;
  onSubmit: (input: CalendarFeedInput) => Promise<unknown>;
};

/**
 * 配信 URL の発行と、名前・参加者の変更。決めるのは名前と、この URL に載せる参加者だけで、
 * URL はサーバーが作って一覧に出る（変更しても URL は変わらないので、渡した先はそのまま使える）。
 *
 * 発行の既定は全員。参加者で絞るのは「相手には見せない URL を渡したい」ときの選択なので、
 * 何も選ばなければカレンダーに出ているものがそのまま配られる方が驚きが無い。
 */
export function CalendarFeedForm({ feed, onClose, onSubmit }: Props) {
  const { users } = useUserLabels();
  const { errors, submitError, submitted, handleSubmit } = useFormSubmit({
    schema: calendarFeedSchema,
    // チェックボックス群は同じ name の複数値なので、formValues の 1 つだけを上書きする
    values: (formData) => ({
      ...formValues(formData),
      participantIds: formList(formData, 'participantIds'),
    }),
    onSubmit,
    onSaved: onClose,
  });

  return (
    <RecordSheet
      open={!submitted}
      error={submitError}
      onClose={onClose}
      title={feed ? '配信 URL を編集' : '配信 URL を発行'}
      onSubmit={handleSubmit}
    >
      <TextField
        name="name"
        label="名前"
        placeholder="スマホのカレンダー"
        defaultValue={feed?.name ?? ''}
        error={Boolean(errors.name)}
        helperText={errors.name}
        autoFocus
        fullWidth
      />
      <ParticipantsField
        name="participantIds"
        label="配信する参加者"
        defaultValue={feed?.participantIds ?? users.map((user) => user.id)}
        error={errors.participantIds}
      />
    </RecordSheet>
  );
}
