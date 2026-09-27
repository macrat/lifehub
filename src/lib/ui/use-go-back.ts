import { useCanGoBack, useNavigate, useRouter } from '@tanstack/react-router';

/**
 * 1 つ前の画面へ戻る（ブラウザの戻ると同じ）。このアプリの中で移ってきたのでなければ（URL を直に開いた・
 * 通知から開いた）戻る先がアプリの外になるので、代わりに fallback（既定はホーム）へ移る。
 */
export function useGoBack(fallback = '/') {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const navigate = useNavigate();
  return () => {
    if (canGoBack) router.history.back();
    else void navigate({ to: fallback });
  };
}
