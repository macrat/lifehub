import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { today, toMonthString } from '../../../lib/date.ts';

type Props = {
  open: boolean;
  /** 今表示している月 "YYYY-MM" */
  month: string;
  onClose: () => void;
  onSelect: (month: string) => void;
};

/** 年月を選ぶダイアログ。AppBar の年月をタップして開く。年を ‹ › で送り、月を 1 つ選ぶ。 */
export function MonthPickerDialog({ open, month, onClose, onSelect }: Props) {
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const thisMonth = toMonthString(today());
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      aria-labelledby="month-picker-year"
    >
      <DialogContent sx={{ p: 2 }}>
        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}
        >
          <IconButton aria-label="前の年" onClick={() => setYear((y) => y - 1)}>
            <ChevronLeftIcon />
          </IconButton>
          <Typography id="month-picker-year" variant="h6" component="div">
            {year}年
          </Typography>
          <IconButton aria-label="次の年" onClick={() => setYear((y) => y + 1)}>
            <ChevronRightIcon />
          </IconButton>
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
          {Array.from({ length: 12 }, (_, i) => {
            const value = `${year}-${String(i + 1).padStart(2, '0')}`;
            const selected = value === month;
            const current = value === thisMonth;
            return (
              <Button
                key={value}
                variant={selected ? 'contained' : current ? 'outlined' : 'text'}
                color={selected || current ? 'primary' : 'inherit'}
                onClick={() => onSelect(value)}
                sx={{ py: 1.25 }}
              >
                {i + 1}月
              </Button>
            );
          })}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
