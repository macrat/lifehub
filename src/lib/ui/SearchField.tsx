import InputBase from '@mui/material/InputBase';
import { useRef, useState } from 'react';

type Props = {
  /** 何を検索するのかを示す文言（プレースホルダと読み上げのラベル） */
  label: string;
  value: string;
  onChange: (value: string) => void;
};

/**
 * AppBar に置く検索窓。type="search" にしてブラウザ標準のクリアボタン・履歴に任せる。
 * 帯の残り幅をすべて使い、右隣のボタン（絞り込みなど）を押し出さないよう縮む。
 *
 * 表示中の文字列は自分で持ち、IME の変換中（compositionstart〜compositionend）は onChange を呼ばない。
 * 検索語は URL に置かれ戻ってくるまでに描画を挟むため、変換途中の文字を渡すと戻り値で入力欄が書き換わり変換が切れる。
 * 外から値が変わったとき（履歴を戻る、クリアなど）は入力欄に反映するが、変換中は触らない。
 */
export function SearchField({ label, value, onChange }: Props) {
  const [text, setText] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  const composing = useRef(false);

  if (value !== lastValue) {
    setLastValue(value);
    if (!composing.current) setText(value);
  }

  const update = (next: string) => {
    setText(next);
    if (!composing.current) onChange(next);
  };

  return (
    <InputBase
      type="search"
      placeholder={label}
      value={text}
      onChange={(e) => update(e.target.value)}
      inputProps={{
        'aria-label': label,
        onCompositionStart: () => {
          composing.current = true;
        },
        onCompositionEnd: (e) => {
          composing.current = false;
          update(e.currentTarget.value);
        },
      }}
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
