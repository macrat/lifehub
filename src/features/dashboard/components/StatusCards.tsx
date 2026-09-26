import { useQuery } from '@tanstack/react-query';
import type { CareType } from '../../../../shared/validation/lemon.ts';
import { QueryView } from '../../../lib/ui/QueryView.tsx';
import { StatusTileSkeleton, TileGrid } from '../../../lib/ui/StatusTile.tsx';
import { CareStatusTile } from '../../lemon/components/CareStatusTile.tsx';
import { lemonStatusQueryOptions } from '../../lemon/queries.ts';
import { WeatherTile } from '../../weather/components/WeatherTile.tsx';
import { useHomeWeather } from '../../weather/queries.ts';

/** ホームに出すレモンの項目（毎日の世話）。ほかの項目はレモン画面で見る */
const HOME_CARE_TYPES: readonly CareType[] = ['mist', 'water'];

type Props = {
  /** 天気のタイルを押した（週間天気を開く） */
  onOpenWeather: () => void;
  /** 世話のタイルを押した（その項目にチェックを入れた記録の入力を開く） */
  onAddCare: (careTypes: CareType[]) => void;
};

/**
 * ホームの上に並べる最新の状態: 天気・葉水・水やりのタイルを横に 3 つ。
 * それぞれの機能の画面と同じクエリを読むので、書き込めばその場で変わる。
 * 天気のタイルを押すと週間天気が、世話のタイルを押すとその記録の入力が開く（開くのは画面の側）。
 */
export function StatusCards({ onOpenWeather, onAddCare }: Props) {
  const weather = useHomeWeather();
  const status = useQuery(lemonStatusQueryOptions);
  return (
    <TileGrid columns={1 + HOME_CARE_TYPES.length} sx={{ px: 2, py: 1 }}>
      <QueryView query={weather} skeleton={<StatusTileSkeleton />}>
        {(home) => <WeatherTile home={home} onClick={onOpenWeather} />}
      </QueryView>
      <QueryView
        query={status}
        skeleton={HOME_CARE_TYPES.map((careType) => <StatusTileSkeleton key={careType} />)}
      >
        {(statuses) =>
          statuses
            .filter((s) => HOME_CARE_TYPES.includes(s.careType))
            .map((s) => (
              <CareStatusTile
                key={s.careType}
                status={s}
                onSelect={() => onAddCare([s.careType])}
              />
            ))
        }
      </QueryView>
    </TileGrid>
  );
}
