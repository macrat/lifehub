import { CARE_TYPE_LABELS } from '../../../../shared/validation/lemon.ts';
import { formatDate } from '../../../lib/date.ts';
import { StatusTile } from '../../../lib/ui/StatusTile.tsx';
import { CARE_TYPE_ICONS } from '../care-type-icons.tsx';
import type { CareStatus } from '../queries.ts';

type Props = {
  status: CareStatus;
  onSelect?: ((status: CareStatus) => void) | undefined;
};

/**
 * 項目 1 つの最終実施日と経過日数（`StatusTile`）。タップでその項目にチェックを入れた記録フォームを開く。
 * 名前の左にはその項目のアイコンを出す（記録の一覧のアイコンの凡例になる）。
 * ホーム（葉水・水やりだけ）とレモン画面（6 項目）のどちらもこれを出すので、行き来するときは
 * 同じ項目のタイルがその場から動き、片方にしかない項目はフェードする（View Transition）。
 */
export function CareStatusTile({ status, onSelect }: Props) {
  const Icon = CARE_TYPE_ICONS[status.careType];
  return (
    <StatusTile
      icon={<Icon />}
      label={CARE_TYPE_LABELS[status.careType]}
      value={
        status.daysSince === null
          ? '—'
          : status.daysSince === 0
            ? '今日'
            : `${status.daysSince}日前`
      }
      sub={status.lastDoneAt ? formatDate(status.lastDoneAt) : '記録なし'}
      transitionName={`care-${status.careType}`}
      onClick={() => onSelect?.(status)}
    />
  );
}
