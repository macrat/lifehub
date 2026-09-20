import Typography from '@mui/material/Typography';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/')({
  component: HomePage,
});

function HomePage() {
  return (
    <Typography variant="h5" component="h2">
      Hello
    </Typography>
  );
}
