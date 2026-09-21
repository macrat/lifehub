import type { CareType } from '../../../../shared/validation/lemon.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import type { CareLogBody } from '../queries.ts';
import { useCareLogForm } from '../use-care-log-form.ts';
import { CareLogFields } from './CareLogFields.tsx';

type Props = {
  initialCareType?: CareType;
  onSubmit: (input: CareLogBody) => Promise<unknown>;
  onClose: () => void;
};

/** レモンの世話の記録を追加する。日時の既定は今。編集は詳細（`CareLogDetailSheet`）から行う。 */
export function CareLogForm({ initialCareType = 'water', onSubmit, onClose }: Props) {
  const { careType, setCareType, errors, submitError, submitted, handleSubmit } = useCareLogForm({
    initialCareType,
    onSubmit,
    onSaved: onClose,
  });

  return (
    <RecordSheet
      open={!submitted}
      error={submitError}
      onClose={onClose}
      title="レモンの記録"
      onSubmit={handleSubmit}
    >
      <CareLogFields careType={careType} onChangeCareType={setCareType} errors={errors} />
    </RecordSheet>
  );
}
