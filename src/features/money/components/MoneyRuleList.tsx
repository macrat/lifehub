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
import type { MoneyRule } from '../../../../shared/validation/money.ts';
import { EditableList, EditableListItem } from '../../../lib/ui/EditableList.tsx';
import { EmptyMessage } from '../../../lib/ui/QueryView.tsx';
import { type ItemColors, useUserColor } from '../../users/use-user-color.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import { describeRule, ruleParties } from '../rule-text.ts';
import { PartiesMark } from './PartiesMark.tsx';

/**
 * 取り込みルールの一覧（上から順に当てる）。行は左に当たった入出金の印（お金の画面の入出金の印と同じ）、パターンと
 * 説明（置換・種別と対象者・一覧に表示しない）、右端の鉛筆で変更を開く（形は `EditableList`）。
 * 行の左端の取っ手を引くと並べ替える（キーボードでも動かせる）。状態と保存は `useMoneyRules`
 */
export function MoneyRuleList({
  rules,
  onMove,
  onEdit,
}: {
  rules: MoneyRule[];
  /** 引いたルール（activeId）を、落とした先のルール（overId）の位置へ */
  onMove: (activeId: string, overId: string) => void;
  onEdit: (rule: MoneyRule) => void;
}) {
  const { label } = useUserLabels();
  const colorFor = useUserColor();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  if (rules.length === 0) {
    return <EmptyMessage>取り込みルールはありません</EmptyMessage>;
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (over) onMove(String(active.id), String(over.id));
      }}
    >
      <SortableContext items={rules} strategy={verticalListSortingStrategy}>
        <EditableList>
          {rules.map((rule) => (
            <RuleItem
              key={rule.id}
              rule={rule}
              label={label}
              colorFor={colorFor}
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
  label,
  colorFor,
  onEdit,
}: {
  rule: MoneyRule;
  label: (userId: string | null) => string;
  colorFor: (userId: string | null) => ItemColors;
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
      handle={{ ref: setActivatorNodeRef, ...attributes, ...listeners }}
      icon={<PartiesMark parties={ruleParties(rule)} colorFor={colorFor} />}
      primary={rule.pattern}
      secondary={describeRule(rule, label)}
      editLabel={`${rule.pattern} を編集`}
      onEdit={onEdit}
    />
  );
}
