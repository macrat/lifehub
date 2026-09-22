import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Typography from '@mui/material/Typography';
import { CARE_TYPE_LABELS } from '../../../../shared/validation/lemon.ts';
import { formatDate } from '../../../lib/date.ts';
import { CARE_TYPE_ICONS } from '../care-type-icons.tsx';
import type { CareStatus } from '../queries.ts';

type Props = {
  statuses: CareStatus[];
  onSelect?: (status: CareStatus) => void;
};

/**
 * 項目ごとの最終実施日と経過日数。タップでその項目にチェックを入れた記録フォームを開く。
 * 名前の左にはその項目のアイコンを出す。記録の一覧はアイコンだけで並ぶので、
 * 同じ画面の上にあるこのタイルがその凡例になる（一覧の外に凡例を足さずに済む）。
 * ホーム（葉水・水やりだけ）とレモン画面（6 項目）のどちらもこれを出すので、行き来するときは
 * 同じ項目のカードがその場から動き、片方にしかない項目はフェードする（View Transition）。
 */
export function CareStatusGrid({ statuses, onSelect }: Props) {
  return (
    <Box
      sx={{
        display: 'grid',
        // スマホは 3 列（6 項目が 2 行に収まり、記録フォームのチェックボックスと同じ並びになる）。
        // 広い画面では自然に 1 行に並ぶ。
        gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', sm: 'repeat(6, minmax(0, 1fr))' },
        gap: 1,
      }}
    >
      {statuses.map((status) => {
        const Icon = CARE_TYPE_ICONS[status.careType];
        return (
          <Card
            key={status.careType}
            sx={{ bgcolor: 'action.hover', viewTransitionName: `care-${status.careType}` }}
          >
            <CardActionArea onClick={() => onSelect?.(status)} sx={{ p: 1, height: '100%' }}>
              <Typography
                variant="caption"
                color="text.secondary"
                component="p"
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
              >
                {/* 名前がすぐ右にあるので、読み上げではアイコンに名乗らせない（SvgIcon の既定） */}
                <Icon sx={{ fontSize: '1rem' }} />
                {CARE_TYPE_LABELS[status.careType]}
              </Typography>
              <Typography variant="h6" component="p" sx={{ lineHeight: 1.3 }}>
                {status.daysSince === null
                  ? '—'
                  : status.daysSince === 0
                    ? '今日'
                    : `${status.daysSince}日前`}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {status.lastDoneAt ? formatDate(status.lastDoneAt) : '記録なし'}
              </Typography>
            </CardActionArea>
          </Card>
        );
      })}
    </Box>
  );
}
