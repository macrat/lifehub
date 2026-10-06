import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import IconButton from '@mui/material/IconButton';
import type { ReactNode } from 'react';
import type { MoneyRule } from '../../../../shared/validation/money.ts';
import { EditableList, EditableListItem } from '../../../lib/ui/EditableList.tsx';
import { EmptyMessage } from '../../../lib/ui/QueryView.tsx';
import { PartiesMark } from '../../expenses/components/PartiesMark.tsx';
import { useUserColor } from '../../users/use-user-color.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import { describeRule, ruleParties } from '../rule-text.ts';
import type { MoneyRulesState } from '../use-money-rules.ts';

/**
 * 取り込みルールの一覧（上から順に当てる）。行は左に当たった入出金の印（お金の画面の入出金の印と同じ）、パターンと
 * 説明（置換・種別と対象者・一覧に表示しない）、右端の鉛筆で変更を開く（形は `EditableList`）。
 * 行の左端の取っ手を引くと並べ替える（キーボードでも動かせる）。状態と保存は `useMoneyRules`
 */
export function MoneyRuleList({
  state,
  onEdit,
}: {
  state: MoneyRulesState;
  onEdit: (rule: MoneyRule) => void;
}) {
  const { label } = useUserLabels();
  const colorFor = useUserColor();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  if (state.rules.length === 0) {
    return <EmptyMessage>取り込みルールはありません</EmptyMessage>;
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (over) state.move(String(active.id), String(over.id));
      }}
    >
      <SortableContext items={state.rules} strategy={verticalListSortingStrategy}>
        <EditableList>
          {state.rules.map((rule) => (
            <RuleItem
              key={rule.id}
              rule={rule}
              mark={<PartiesMark parties={ruleParties(rule)} colorFor={colorFor} />}
              description={describeRule(rule, label)}
              onEdit={() => onEdit(rule)}
            />
          ))}
        </EditableList>
      </SortableContext>
    </DndContext>
  );
}

function RuleItem({
  rule,
  mark,
  description,
  onEdit,
}: {
  rule: MoneyRule;
  mark: ReactNode;
  description: string;
  onEdit: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rule.id });
  return (
    <EditableListItem
      ref={setNodeRef}
      // 引いている間は描くたびに位置が変わるので、クラスを作らずに style で動かす
      style={{ transform: CSS.Transform.toString(transform), transition }}
      sx={{ bgcolor: isDragging ? 'action.selected' : undefined, pl: 0.5 }}
      handle={
        <IconButton
          ref={setActivatorNodeRef}
          size="small"
          aria-label="並べ替え"
          {...attributes}
          {...listeners}
          // 指で引くときに画面がスクロールしないよう、取っ手の上ではブラウザのタッチ操作を止める
          sx={{ cursor: 'grab', touchAction: 'none' }}
        >
          <DragIndicatorIcon />
        </IconButton>
      }
      icon={mark}
      iconWidth={20}
      primary={rule.pattern}
      secondary={description}
      editLabel={`${rule.pattern} を編集`}
      onEdit={onEdit}
    />
  );
}
