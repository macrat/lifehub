import type { Page } from '@playwright/test';

/** 起きた遷移 1 つ分。ready は名前が重複していると失敗する（＝遷移が飛ばされる） */
export type Transition = {
  ready: string;
  finished: boolean;
  /** 遷移後として撮られる時点（更新コールバックの直後）に在った view-transition-name */
  captured: string[];
};

declare global {
  interface Window {
    /** このテストのための控え（`recordViewTransitions` が document.startViewTransition を包んで記録する） */
    viewTransitions: Transition[];
  }
}

/**
 * 画面を移るときの View Transition（`src/main.tsx` の defaultViewTransition）を控える仕掛け。
 * 遷移は Promise でしか終わりが分からないので、テストからは `document.startViewTransition` を
 * 包んで記録し、`settle` / `changeView` で待つ。`page.goto` より前に仕込むこと。
 */
export async function recordViewTransitions(page: Page) {
  await page.addInitScript(() => {
    window.viewTransitions = [];
    const start = document.startViewTransition.bind(document);
    const collect = () =>
      [...document.querySelectorAll('*')]
        .map((el) => getComputedStyle(el).viewTransitionName)
        .filter((name) => name !== 'none');
    document.startViewTransition = (update) => {
      const record: Transition = { ready: 'pending', finished: false, captured: [] };
      window.viewTransitions.push(record);
      // 遷移後のスナップショットは更新コールバックが解決したあとに撮られるので、その直後を控える
      const callback = typeof update === 'function' ? update : update?.update;
      const wrapped = async () => {
        await callback?.();
        record.captured = collect();
      };
      const transition = start(
        typeof update === 'object' && update !== null ? { ...update, update: wrapped } : wrapped,
      );
      transition.ready.then(
        () => {
          record.ready = 'ok';
        },
        (error: DOMException) => {
          record.ready = `${error.name}: ${error.message}`;
        },
      );
      transition.finished.then(() => {
        record.finished = true;
      });
      return transition;
    };
  });
}

/** 起きた遷移の一覧 */
export const transitions = (page: Page): Promise<Transition[]> =>
  page.evaluate(() => window.viewTransitions);

/** 直前の遷移が終わる（＝新しい画面が DOM に出そろう）まで待つ */
export const settle = (page: Page) =>
  page.waitForFunction(() => window.viewTransitions.at(-1)?.finished === true);

/**
 * AppBar のメニューで表示（月・週・日・リスト）を切り替え、遷移が終わるまで待つ。
 * 終わるまで待つのは、遷移の最中は本物の DOM ではなく撮った絵が前に出ていて、指で触れないため
 * （押しても root に届き、そのまま横スワイプに化ける）。
 */
export async function changeView(page: Page, label: string) {
  const before = (await transitions(page)).length;
  await page.getByRole('button', { name: '表示の切替' }).click();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
  await page.waitForFunction(
    (n) => window.viewTransitions.length > n && window.viewTransitions.at(-1)?.finished === true,
    before,
  );
}
