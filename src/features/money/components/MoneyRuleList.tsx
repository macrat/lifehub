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
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import type { MoneyRuleKind } from '../../../../shared/money.ts';
import type { MoneyRule } from '../../../../shared/validation/money.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import type { MoneyRulesState } from '../use-money-rules.ts';

/** 種別の選択肢（支出はただの支出、入金・出金は対象者と「共有」との立替） */
const KIND_LABELS: Record<MoneyRuleKind, string> = {
  spending: '支出',
  deposit: '入金',
  withdrawal: '出金',
};

/** 2 つの欄を横に並べる行（左の欄は中身の幅、右の欄が残りを取る） */
const FIELD_ROW_SX = { alignItems: 'center', gap: 1 } as const;

/**
 * 入出金の読み替えのルールの並び（管理画面）。上から順に当て、最初に当たったルールを使う。
 * 1 つのルールは 3 段: ドラッグの取っ手・パターン・削除、内容欄を置換するか・置換後の内容欄、種別・対象者。
 * 置換後の内容欄は置換しないなら、対象者は支出なら選べない。状態と保存は `useMoneyRules`。
 */
export function MoneyRuleList({ state }: { state: MoneyRulesState }) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  return (
    <Stack spacing={2} sx={{ p: 2 }}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={({ active, over }) => {
          if (over) state.move(String(active.id), String(over.id));
        }}
      >
        <SortableContext items={state.rules} strategy={verticalListSortingStrategy}>
          {state.rules.map((rule, index) => (
            <RuleCard key={rule.id} rule={rule} order={index + 1} state={state} />
          ))}
        </SortableContext>
      </DndContext>
      <Button startIcon={<AddIcon />} onClick={state.add} sx={{ alignSelf: 'flex-start' }}>
        ルールを追加
      </Button>
    </Stack>
  );
}

function RuleCard({
  rule,
  order,
  state,
}: {
  rule: MoneyRule;
  /** 上からの順番（1 から）。読み上げの名前に使う */
  order: number;
  state: MoneyRulesState;
}) {
  const { users } = useUserLabels();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } =
    useSortable({ id: rule.id });
  const errors = state.errorsOf(rule);
  return (
    <Paper
      ref={setNodeRef}
      component="section"
      aria-label={`ルール ${order}`}
      variant="outlined"
      sx={{ p: 1.5 }}
      // ドラッグ中は描くたびに位置が変わるので、クラスを作らずに style で動かす
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" sx={FIELD_ROW_SX}>
          <IconButton
            ref={setActivatorNodeRef}
            aria-label="並べ替え"
            {...attributes}
            {...listeners}
            // 指で引くときに画面がスクロールしないよう、取っ手の上ではブラウザのタッチ操作を止める
            sx={{ cursor: 'grab', touchAction: 'none' }}
          >
            <DragIndicatorIcon />
          </IconButton>
          <TextField
            label="パターン（正規表現）"
            size="small"
            fullWidth
            value={rule.pattern}
            onChange={(e) => state.edit(rule.id, { pattern: e.target.value })}
            onBlur={state.saveDraft}
            error={errors.pattern !== undefined}
            helperText={errors.pattern}
            slotProps={{ htmlInput: { spellCheck: false, autoCapitalize: 'off' } }}
          />
          <IconButton aria-label="ルールを削除" onClick={() => state.remove(rule.id)}>
            <CloseIcon />
          </IconButton>
        </Stack>
        <Stack direction="row" sx={FIELD_ROW_SX}>
          <FormControlLabel
            label="内容欄を置換"
            control={
              <Switch
                checked={rule.replaceDescription}
                onChange={(e) => state.setReplace(rule.id, e.target.checked)}
              />
            }
            sx={{ flexShrink: 0, mr: 0 }}
          />
          <TextField
            label="置換後の内容欄"
            size="small"
            fullWidth
            disabled={!rule.replaceDescription}
            value={rule.replacement}
            onChange={(e) => state.edit(rule.id, { replacement: e.target.value })}
            onBlur={state.saveDraft}
            error={errors.replacement !== undefined}
            helperText={errors.replacement}
          />
        </Stack>
        <Stack direction="row" sx={FIELD_ROW_SX}>
          <TextField
            label="種別"
            select
            size="small"
            value={rule.kind}
            onChange={(e) => state.setKind(rule.id, e.target.value as MoneyRuleKind)}
            sx={{ minWidth: 112 }}
          >
            {Object.entries(KIND_LABELS).map(([kind, label]) => (
              <MenuItem key={kind} value={kind}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="対象者"
            select
            size="small"
            fullWidth
            disabled={rule.kind === 'spending'}
            value={rule.userId ?? ''}
            onChange={(e) => state.setUser(rule.id, e.target.value)}
            error={errors.userId !== undefined}
            helperText={errors.userId}
          >
            {users.map((user) => (
              <MenuItem key={user.id} value={user.id}>
                {user.name}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Stack>
    </Paper>
  );
}
