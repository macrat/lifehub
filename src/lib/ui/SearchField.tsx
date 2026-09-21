import InputBase from '@mui/material/InputBase';

type Props = {
  /** 何を検索するのかを示す文言（プレースホルダと読み上げのラベル） */
  label: string;
  value: string;
  onChange: (value: string) => void;
};

/**
 * AppBar に置く検索窓。type="search" にしてブラウザ標準のクリアボタン・履歴に任せる。
 * 帯の残り幅をすべて使い、右隣のボタン（絞り込みなど）を押し出さないよう縮む。
 */
export function SearchField({ label, value, onChange }: Props) {
  return (
    <InputBase
      type="search"
      placeholder={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      inputProps={{ 'aria-label': label }}
      sx={{
        flexGrow: 1,
        minWidth: 0,
        bgcolor: 'action.hover',
        borderRadius: 5,
        px: 1.5,
        py: 0.25,
      }}
    />
  );
}
