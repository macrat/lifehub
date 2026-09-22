import type { CareType } from '../../../../shared/validation/lemon.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import type { CareLogBody } from '../queries.ts';
import { useCareLogForm } from '../use-care-log-form.ts';
import { CareLogFields } from './CareLogFields.tsx';

/** 追加ボタンから始めたときに最初からチェックを入れておく項目。いちばん高頻度にやるのが葉水 */
export const DEFAULT_CARE_TYPES: CareType[] = ['mist'];

type Props = {
  /** 最初からチェックを入れておく項目。状況のタイルから始めたときはそのタイルの項目 */
  initialCareTypes?: CareType[];
  onSubmit: (input: CareLogBody) => Promise<unknown>;
  onClose: () => void;
};

/** レモンの世話の記録を追加する。日時の既定は今。編集は詳細（`CareLogDetailSheet`）から行う。 */
export function CareLogForm({ initialCareTypes = DEFAULT_CARE_TYPES, onSubmit, onClose }: Props) {
  const { careTypes, toggleCareType, errors, submitError, submitted, handleSubmit } =
    useCareLogForm({ initialCareTypes, onSubmit, onSaved: onClose });

  return (
    <RecordSheet
      open={!submitted}
      error={submitError}
      onClose={onClose}
      title="レモンの記録を追加"
      onSubmit={handleSubmit}
    >
      <CareLogFields careTypes={careTypes} onToggleCareType={toggleCareType} errors={errors} />
    </RecordSheet>
  );
}
