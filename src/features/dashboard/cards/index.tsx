import type { DashboardCard } from '../queries.ts';
import { BalanceCard } from './BalanceCard.tsx';
import { LemonCard } from './LemonCard.tsx';
import { TodayCard } from './TodayCard.tsx';

/** カード ID → 描画コンポーネント。サーバーの registry に足したカードはここにも 1 行足す。 */
export function renderCard(card: DashboardCard) {
  switch (card.id) {
    case 'today':
      return <TodayCard key={card.id} card={card} />;
    case 'expenses-balance':
      return <BalanceCard key={card.id} card={card} />;
    case 'lemon':
      return <LemonCard key={card.id} card={card} />;
  }
}
