import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { type LinkProps, useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';

type Props = {
  title: string;
  to: LinkProps['to'];
  children: ReactNode;
};

/** ホームの 1 区画。見出しをタップすると該当機能の画面へ遷移する。枠線や影は持たない。 */
export function DashboardCardFrame({ title, to, children }: Props) {
  const navigate = useNavigate();
  return (
    <Box component="section" sx={{ py: 1 }}>
      <SectionHeading title={title} onClick={() => navigate({ to })} />
      <Box sx={{ px: 2 }}>{children}</Box>
    </Box>
  );
}

export function SectionHeading({ title, onClick }: { title: string; onClick: () => void }) {
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
