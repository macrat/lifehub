import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import { type LinkProps, useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';

type Props = {
  title: string;
  to: LinkProps['to'];
  children: ReactNode;
};

/** ホームのカードの枠。タップで該当機能の画面へ遷移する。 */
export function DashboardCardFrame({ title, to, children }: Props) {
  const navigate = useNavigate();
  return (
    <Card variant="outlined">
      <CardActionArea onClick={() => navigate({ to })} component="div">
        <CardContent>
          <Typography variant="overline" component="h3" color="text.secondary">
            {title}
          </Typography>
          {children}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
