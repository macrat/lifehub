import Box from '@mui/material/Box';
import Slider from '@mui/material/Slider';
import useMediaQuery from '@mui/material/useMediaQuery';
import { HUE_MAX, hueColor, hueRamp } from '../../../../shared/color.ts';

type Props = {
  value: number;
  onChange: (hue: number) => void;
  /** 指を離した／確定したとき（保存のタイミング） */
  onCommit?: (hue: number) => void;
  label?: string;
};

/**
 * ユーザーの色を選ぶスライダー。選べるのは OKLCH の色相だけで、彩度と明度はアプリが決める。
 * 帯には実際に使われる「fill」の色を並べ、つまみは選んだ色で塗る。
 */
export function HueSlider({ value, onChange, onCommit, label = '色' }: Props) {
  const dark = useMediaQuery('(prefers-color-scheme: dark)');
  const mode = dark ? 'dark' : 'light';
  const ramp = [...hueRamp('fill', mode), hueColor(0, 'fill', mode)];
  const color = hueColor(value, 'fill', mode);
  return (
    <Box sx={{ px: 1 }}>
      <Slider
        aria-label={label}
        min={0}
        max={HUE_MAX}
        value={value}
        onChange={(_, v) => onChange(v)}
        onChangeCommitted={(_, v) => onCommit?.(v)}
        sx={{
          height: 12,
          '& .MuiSlider-rail': {
            opacity: 1,
            background: `linear-gradient(to right, ${ramp.join(', ')})`,
          },
          '& .MuiSlider-track': { display: 'none' },
          '& .MuiSlider-thumb': {
            width: 24,
            height: 24,
            bgcolor: color,
            border: '3px solid',
            borderColor: 'background.paper',
            boxShadow: 1,
          },
        }}
      />
    </Box>
  );
}
