import type { CareType } from '../../../../shared/validation/lemon.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import { useLogCare } from '../queries.ts';
import { DEFAULT_CARE_TYPES, useCareLogForm } from '../use-care-log-form.ts';
import { CareLogFields } from './CareLogFields.tsx';

type Props = {
  /** 最初からチェックを入れておく項目。状況のタイルから始めたときはそのタイルの項目 */
  initialCareTypes?: CareType[];
  onClose: () => void;
};

/**
 * レモンの世話の記録を追加する。日時の既定は今。保存先（`useLogCare`）はこの中で持つので、
 * どこから開いても同じ所へ保存する（詳細の `CareLogDetailSheet` が自分で更新の mutation を持つのと同じ）。
 * 編集は詳細から行う。
 */
export function CareLogForm({ initialCareTypes = DEFAULT_CARE_TYPES, onClose }: Props) {
  const logCare = useLogCare();
  const { careTypes, toggleCareType, errors, sheet } = useCareLogForm({
    initialCareTypes,
    onSubmit: logCare.mutateAsync,
    onSaved: onClose,
  });

  return (
    <RecordSheet {...sheet} onClose={onClose} title="レモンの記録を追加">
      <CareLogFields careTypes={careTypes} onToggleCareType={toggleCareType} errors={errors} />
    </RecordSheet>
  );
}
