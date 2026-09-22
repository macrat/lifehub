import ChecklistIcon from '@mui/icons-material/Checklist';
import EventIcon from '@mui/icons-material/Event';
import PaymentsIcon from '@mui/icons-material/Payments';
import SpaIcon from '@mui/icons-material/Spa';
import type { ComponentType } from 'react';

/** 追加ボタン（`AddMenu`）から追加できる種類 */
export type AddKind = 'event' | 'task' | 'expense' | 'lemon';

/** その場でフォームが開く種類（`AddForm`）。予定だけはカレンダーの日表示へ送って下書きを置く */
export type AddFormKind = Exclude<AddKind, 'event'>;

/**
 * 種類ごとの名前とアイコン。ビルド時のスクリプト（Node、DOM 型なし）も読むので、
 * この file に JSX は書かない（アイコンは描かずに持つだけ）。
 */
export const ADD_KINDS: Record<AddKind, { label: string; icon: ComponentType }> = {
  event: { label: '予定', icon: EventIcon },
  task: { label: 'タスク', icon: ChecklistIcon },
  expense: { label: '立替', icon: PaymentsIcon },
  lemon: { label: 'レモン', icon: SpaIcon },
};
