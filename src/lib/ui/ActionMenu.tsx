import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import type { MouseEvent, ReactNode } from 'react';
import { useActionMenu } from './use-action-menu.ts';

/** メニューに並べる操作 */
export type MenuAction = {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  /** 取り返しのつかない操作。赤で出す */
  danger?: boolean;
  /** 今選ばれている（表示の切替の今の表示） */
  selected?: boolean;
};

const DANGER_SX = { color: 'error.main' };

/**
 * ボタンから開く操作のメニュー（記録のシートの三点リーダー、カレンダーの表示の切替）。
 * 開いている間は履歴に項目を持ち、戻る操作ではメニューだけが閉じる（`useActionMenu`）。
 * MUI の Menu は部品から直接使わず、これを使う（biome が禁じる）。
 */
export function ActionMenu({
  button,
  actions,
}: {
  /** メニューを開くボタン。押したら open を呼ぶ（押したボタンにメニューを寄せる） */
  button: (open: (event: MouseEvent<HTMLElement>) => void) => ReactNode;
  actions: MenuAction[];
}) {
  const menu = useActionMenu();
  return (
    <>
      {button(menu.open)}
      <Menu anchorEl={menu.anchor} open={menu.anchor !== null} onClose={menu.close}>
        {actions.map((action) => (
          <MenuItem
            key={action.label}
            selected={action.selected}
            onClick={() => menu.select(action.onClick)}
            sx={action.danger ? DANGER_SX : undefined}
          >
            {action.icon && (
              <ListItemIcon sx={action.danger ? DANGER_SX : undefined}>{action.icon}</ListItemIcon>
            )}
            {action.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
