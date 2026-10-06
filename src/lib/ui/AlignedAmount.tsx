import Typography from '@mui/material/Typography';

/**
 * 一覧の金額の列（立替・入出金）。列の幅は読んだ記録の中で一番幅を取る金額に合わせる（`widestOf`）: 決め打ちの幅だと、
 * 普段の数千円の記録にまれな 6 桁が収まる幅を取り続けて本文が狭くなる。
 * 幅は測らず、一番幅を取る金額を透明にして同じ升目に重ね、CSS に中身の幅として決めさせる
 * （フォントや文字の幅をコードで見積もらずに済み、どの行も同じ幅になる）。
 * 桁は `MarkedRow` が揃えるので、ここは帳簿と同じ右寄せだけを足す。
 */
export function AlignedAmount({ text, widest }: { text: string; widest: string }) {
  return (
    <Typography
      variant="body2"
      component="div"
      sx={{ display: 'grid', justifyItems: 'end', '& > *': { gridArea: '1 / 1' } }}
    >
      <span aria-hidden style={{ visibility: 'hidden' }}>
        {widest}
      </span>
      <span>{text}</span>
    </Typography>
  );
}
