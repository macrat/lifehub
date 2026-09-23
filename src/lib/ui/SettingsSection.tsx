import List from '@mui/material/List';
import ListSubheader from '@mui/material/ListSubheader';
import { type ReactNode, useId } from 'react';

type Props = {
  title: string;
  /** 行（`ListItem`）。行でないもの（スライダーや案内）も `ListItem` に入れて渡す */
  children: ReactNode;
};

/**
 * 設定画面の 1 区切り（見出し + 行）。Google 系アプリの設定画面と同じ区切り方で、
 * 見出しは h3（画面の見出しの下）。区切りは機能ごとに別の場所で組み立てる（色は users、
 * 通知は push、アカウントとバージョンは設定のページ）ので、見た目の決め方だけをここに持つ。
 *
 * 見出しは List の `subheader` に渡さず、外に出して section の見出しにする。渡すと ul の直下に
 * 見出しが入り、ul の子は li だけという HTML の決まりから外れる（見た目は ListSubheader のまま）。
 * section は見出しで名前を付けて領域（region）にする。区切りごとに同じ「保存」ボタンを持つので、
 * 支援技術でもテストでも、どの区切りのボタンかを見出しで言い分けられる。
 */
export function SettingsSection({ title, children }: Props) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <ListSubheader id={headingId} component="h3" disableSticky>
        {title}
      </ListSubheader>
      {/* 見出しを外に出したぶん、List の上の余白を落として subheader 付きのときと同じ間隔にする */}
      <List sx={{ pt: 0 }}>{children}</List>
    </section>
  );
}
