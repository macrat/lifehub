import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { type NavigateOptions, useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';

type Props = {
  title: string;
  /** 見出しをタップしたときの遷移先 */
  link: NavigateOptions;
  /** 行の一覧など、内容が自分で左右の余白を持つとき */
  disableGutters?: boolean;
  children: ReactNode;
};

/** ホームの 1 区画。見出しをタップすると該当機能の画面へ遷移する。枠線や影は持たない。 */
export function DashboardCardFrame({ title, link, disableGutters = false, children }: Props) {
  const navigate = useNavigate();
  return (
    <Box component="section" sx={{ py: 1 }}>
      <SectionHeading title={title} onClick={() => navigate(link)} />
      <Box sx={{ px: disableGutters ? 0 : 2 }}>{children}</Box>
    </Box>
  );
}

function SectionHeading({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        px: 2,
        py: 0.5,
        borderRadius: 1,
        color: 'text.secondary',
      }}
    >
      <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <ChevronRightIcon fontSize="small" />
    </ButtonBase>
  );
}
