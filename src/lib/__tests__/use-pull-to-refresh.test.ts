import { QueryClient } from '@tanstack/react-query';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOADS_AT_ATTRIBUTE } from '../ui/loading-edge.ts';
import { useNotice } from '../ui/notice.ts';
import { PULL_THRESHOLD, usePullGesture } from '../ui/use-pull-to-refresh.ts';
import { renderHook } from './render-hook.ts';

/**
 * 引っ張って更新のなぞりの判定。どの端から引けるか（ページの端・一覧が読み足す端・指の下の要素）と、
 * 引き切ったかどうかで、離したときに画面のデータを取り直すかが決まる。
 * 実ブラウザで通して確かめること（ページを読み込み直さない、知らせが出る）は e2e/pull-to-refresh.spec.ts。
 */

let client: QueryClient;
let refetch: ReturnType<typeof vi.fn>;
let area: HTMLElement;
let unmount = () => {};

beforeEach(() => {
  client = new QueryClient();
  refetch = vi.fn(() => Promise.resolve());
  client.refetchQueries = refetch as unknown as QueryClient['refetchQueries'];
  area = document.body.appendChild(document.createElement('div'));
});

afterEach(() => {
  unmount();
  area.remove();
  for (const key of ['scrollTop', 'scrollHeight', 'clientHeight'])
    Reflect.deleteProperty(document.documentElement, key);
});

/** 引ける範囲を area にして描く */
function setup(enabled = true) {
  // 引ける範囲の参照は描き直しても同じ物（画面の ref と同じ）
  const ref = { current: area };
  const rendered = renderHook(() => usePullGesture(ref, enabled), { client });
  unmount = rendered.unmount;
  return rendered.read;
}

/** 範囲の中の一覧が続きを読み足す端（一覧の端の見張りが付ける印） */
function loadsAt(...edges: ('top' | 'bottom')[]) {
  for (const edge of edges) {
    const sentinel = area.appendChild(document.createElement('div'));
    sentinel.setAttribute(LOADS_AT_ATTRIBUTE, edge);
  }
}

/** ページのスクロール位置（jsdom はレイアウトを持たないので、測る値を決めて渡す） */
function scrollPage(scrollTop: number, scrollHeight = 2000, clientHeight = 800) {
  const root = document.documentElement;
  Object.defineProperty(root, 'scrollTop', { value: scrollTop, configurable: true });
  Object.defineProperty(root, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(root, 'clientHeight', { value: clientHeight, configurable: true });
}

const touchAt = (y: number) => ({ clientX: 100, clientY: y }) as Touch;

/** target に指を下ろし、縦に dy だけなぞって離す。duringPull はなぞっている途中にする事 */
function pull(dy: number, target: Element = area, duringPull?: () => void) {
  const send = (type: string, touches: Touch[]) =>
    act(() => {
      target.dispatchEvent(new TouchEvent(type, { bubbles: true, touches }));
    });
  send('touchstart', [touchAt(300)]);
  duringPull?.();
  for (const step of [0.5, 1]) send('touchmove', [touchAt(300 + dy * step)]);
  send('touchend', []);
}

describe('usePullGesture', () => {
  it('ページの上端から下へ引き切って離すと、画面のデータを取り直す', () => {
    setup();
    pull(PULL_THRESHOLD + 20);
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('引き切らずに離すと取り直さない', () => {
    setup();
    pull(PULL_THRESHOLD / 2);
    expect(refetch).not.toHaveBeenCalled();
  });

  it('引けない間（オフライン、引っ張って更新を断った画面）は取り直さない', () => {
    setup(false);
    pull(PULL_THRESHOLD + 20);
    expect(refetch).not.toHaveBeenCalled();
  });

  it('引いている途中で指の下の要素が描き直されて外れても、離せば取り直す', () => {
    const row = area.appendChild(document.createElement('div'));
    setup();
    pull(PULL_THRESHOLD + 20, row, () => row.remove());
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('ページの途中からのなぞり（ふつうのスクロール）は引いたことにしない', () => {
    scrollPage(500);
    setup();
    pull(PULL_THRESHOLD + 20);
    pull(-(PULL_THRESHOLD + 20));
    expect(refetch).not.toHaveBeenCalled();
  });

  it('一覧の無い画面と、下へ読み足す一覧（ホーム・立替・レモン）は、上端からだけ引ける', () => {
    setup();
    pull(-(PULL_THRESHOLD + 20));
    expect(refetch).not.toHaveBeenCalled();
    loadsAt('bottom');
    pull(-(PULL_THRESHOLD + 20));
    expect(refetch).not.toHaveBeenCalled();
    pull(PULL_THRESHOLD + 20);
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('上へ読み足す一覧（天気）は、下端からだけ引ける', () => {
    loadsAt('top');
    setup();
    pull(PULL_THRESHOLD + 20);
    expect(refetch).not.toHaveBeenCalled();
    pull(-(PULL_THRESHOLD + 20));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('上下に読み足す一覧（予定のリスト）は、どちらの端からも引けない', () => {
    loadsAt('top', 'bottom');
    setup();
    pull(PULL_THRESHOLD + 20);
    pull(-(PULL_THRESHOLD + 20));
    expect(refetch).not.toHaveBeenCalled();
  });

  it('縦のなぞりを自分で扱う所（touch-action: none）からは引けない', () => {
    const sheet = area.appendChild(document.createElement('div'));
    sheet.style.touchAction = 'none';
    setup();
    pull(PULL_THRESHOLD + 20, sheet);
    expect(refetch).not.toHaveBeenCalled();
  });

  it('取り直せなかったら、短く（既定より早く消える）知らせる', async () => {
    refetch.mockRejectedValue(new Error('offline'));
    const read = setup();
    const notice = renderHook(useNotice);
    pull(PULL_THRESHOLD + 20);
    expect(read().refreshing).toBe(true);
    await act(async () => {});
    expect(read().refreshing).toBe(false);
    expect(notice.read()).toMatchObject({
      open: true,
      severity: 'error',
      message: '更新できませんでした',
      duration: 3000,
    });
    notice.unmount();
  });
});
