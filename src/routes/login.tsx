import Typography from '@mui/material/Typography';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { LoginForm } from '../features/users/components/LoginForm.tsx';
import { resolveMe, useLogin } from '../lib/auth.ts';
import { loginSearchSchema } from '../lib/login-search.ts';
import { CenteredPage } from '../lib/ui/CenteredPage.tsx';

export const Route = createFileRoute('/login')({
  validateSearch: loginSearchSchema,
  beforeLoad: async ({ context, search }) => {
    // ログイン済みならログイン画面を見せない
    if (await resolveMe(context.queryClient, { revalidate: true })) {
      throw redirect({ to: search.redirect ?? '/' });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const { redirect: redirectTo } = Route.useSearch();
  const login = useLogin(redirectTo);

  return (
    <CenteredPage maxWidth={360}>
      <Typography variant="h5" component="h1" align="center" gutterBottom>
        LifeHub
      </Typography>
      <LoginForm onSubmit={login} />
    </CenteredPage>
  );
}
