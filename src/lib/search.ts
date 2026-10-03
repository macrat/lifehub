import { useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { z } from 'zod';
import { isDateString } from '../../shared/date.ts';
import type { DateString } from '../../shared/types.ts';
import { useToggle } from './ui/use-toggle.ts';

/** キーワード検索をする画面の検索パラメータ。空文字は付けない（検索していない状態は URL にも残さない） */
const keywordSearchSchema = z.object({ q: z.string().optional() });
type KeywordSearch = z.infer<typeof keywordSearchSchema>;

/**
 * 絞り込みのある画面（ホーム・立替・レモン）の検索パラメータ。キーワード（q）と入力を開くしるし
 * （`add`。`src/lib/add-search.ts` の `addSearchSchema`）に、API と同じ絞り込みのスキーマ（`filter`）を足す。
 * 絞り込みは URL に持つので、再読み込みや共有で同じ絞り込みに戻り、規則を API と共有するので
 * そのままサーバーに渡して絞り込ませる。q は検索窓が持つ（`useKeywordSearch`）ので、API の物ではなく
 * ほかの検索する画面と同じ `keywordSearchSchema` の物にする。
 * しるしは引数で受ける（`add-search.ts` がこの file を読むので、ここから読むと import が一巡する）。
 */
export function filterSearchSchema<A extends z.ZodType, S extends { q: z.ZodType } & z.ZodRawShape>(
  add: A,
  filter: z.ZodObject<S>,
) {
  const { q: _apiKeyword, ...shape } = filter.shape;
  return keywordSearchSchema.extend({ add, ...shape });
}

/**
 * 検索キーワードの状態。初期値は URL の q（再読み込みや共有で絞り込みが戻る）。
 * URL の q を読むのはマウントの 1 度だけで、その後は合わせ直さない。画面を開いている間に q を変えるのは
 * ここの replaceState だけで（router を通さないので、画面が受け取る search.q は次の移動まで古いまま）、
 * 絞り込みの変更も置き換えなので同じ画面の中で q の違う履歴は積まれず、別の q の URL から来るのは
 * 画面を開き直したとき（マウントし直して読み直す）だけのため。
 *
 * 打つたびの反映は router の navigate ではなく history.replaceState で URL を差し替えるだけにする。
 * 表示する値は手元の状態なので、入力してから画面に出るまでが同じ描画で完結する。
 * navigate だと入力 → URL → 再描画と非同期に往復し、その間の書き戻しで IME の変換が切れる。
 * 履歴には積まない（1 文字ごとに戻る先が増えると、戻る操作が打ち直しの巻き戻しになる）。
 * router を通さずに書いても、後の移動（絞り込みや表示の切り替え。`usePatchSearch`）で q は消えない。
 * router は移動のたびに今の URL を読み直してから次の URL を組み立てるため（e2e/search.spec.ts が確かめる）。
 */
function useKeywordSearch(initial: string) {
  const [keyword, setKeyword] = useState(initial);

  const change = (next: string) => {
    setKeyword(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('q', next);
    else url.searchParams.delete('q');
    // state はそのまま持ち越す（履歴の項目に付いた鍵を保ち、スクロール位置の復元を壊さない）
    window.history.replaceState(window.history.state, '', url);
  };

  return [keyword, change] as const;
}

/**
 * 画面の絞り込みから、サーバーに渡す絞り込み（取得のキーにもなる）を作る。入力を開くしるし（add）は
 * 絞り込みではないので除き、空のキーワードは「絞り込まない」と同じキーにする
 */
export function toListFilter<T extends { q: string; add?: unknown }>({
  add: _add,
  q,
  ...filter
}: T): Omit<T, 'add' | 'q'> & { q?: string } {
  const keyword = q.trim();
  return keyword ? { ...filter, q: keyword } : filter;
}

/** 選択欄の「すべて」。絞り込まない状態は URL に残さないので、値としては持たず undefined にする */
export const ALL = 'all';

/** 選択欄の値を絞り込みにする。「すべて」（`ALL`）は絞り込みをやめる（URL にも残さない） */
export function optionOrUndefined<T extends string>(value: string): T | undefined {
  return value === ALL ? undefined : (value as T);
}

/** date 入力の値を絞り込みにする。消すと空文字になり、打っている途中は日付にならない。どちらも絞り込みをやめる */
export function dateOrUndefined(value: string): DateString | undefined {
  return isDateString(value) ? value : undefined;
}

/**
 * 今の画面のまま、検索パラメータの一部だけを変える。replace で履歴に積むか置き換えるかを選ぶ
 * （絞り込みの入力やしるしの消去は置き換える。1 項目ごとに戻る先が増えると、戻る操作が入力の巻き戻しになる）。
 * resetScroll: false = 画面のスクロール位置に触らない。既定だと router が移動のたびに位置を復元し、
 * 一覧が絞り込んだ直後に先頭へ飛び、カレンダーはスワイプの面を中央へ戻した直後に元の位置へ引き戻される。
 * 関数は固定する（カレンダーは面に渡す関数をこれから作り、同一性で描き直しを省く）。
 *
 * WHY 型の無い to: '.': どの画面からも呼ぶので、画面ごとの検索パラメータの型をここでは名指せない。
 * 渡す値の型は呼ぶ側（画面の検索パラメータから導いた型）で守る。
 */
export function usePatchSearch() {
  const navigate = useNavigate();
  return useCallback(
    (patch: object, { replace }: { replace: boolean }) =>
      navigate({
        to: '.',
        search: (prev: object) => ({ ...prev, ...patch }),
        replace,
        resetScroll: false,
      }),
    [navigate],
  );
}

/** 画面の絞り込み。キーワードだけは URL ではなく検索窓の手元の値を使う（`useKeywordSearch`） */
export type Filters<S extends KeywordSearch> = Omit<S, 'q'> & { q: string };

/** 更新する項目だけ。undefined はその項目の絞り込みをやめる。キーワードは検索窓が持つのでここには無い */
export type FiltersPatch<S extends KeywordSearch> = {
  [K in Exclude<keyof S, 'q'>]?: S[K] | undefined;
};

/**
 * 絞り込みボタンのバッジに数える条件。1 つの組が 1 つの条件で、範囲の上下のようにまとめて 1 つと数える項目を
 * 同じ組に入れる（バッジの数字が入力欄の数ではなく条件の数になる）。キーワードは検索窓に見えているので数えない。
 */
export type FilterConditions<S> = readonly (readonly Exclude<keyof S, 'q' | 'add'>[])[];

/** 効いている条件（`FilterConditions`）の数。組のどれか 1 つでも値があれば効いている */
export function countActiveFilters<S>(search: S, conditions: FilterConditions<S>): number {
  return conditions.filter((keys) => keys.some((key) => search[key] !== undefined)).length;
}

/**
 * 絞り込みのある画面（ホーム・立替・レモン）の検索の状態。URL の検索パラメータが絞り込みそのもので、
 * 画面はここから受け取った値を描く。キーワードだけは打つたびに反映するので手元に持つ（`useKeywordSearch`）。
 * AppBar の検索窓と絞り込みボタン（`FilterSearchField`）と、その下に開くフォームが同じものを読む。
 * conditions は、絞り込みボタンのバッジに数える条件（`FilterConditions`）の feature ごとの規則。
 */
export function useFilterSearch<S extends KeywordSearch & { add?: unknown }>(
  search: S,
  conditions: FilterConditions<S>,
) {
  const patchSearch = usePatchSearch();
  const [keyword, setKeyword] = useKeywordSearch(search.q ?? '');
  // 詳細な絞り込みのフォームを開いているか（URL には載せない。開き直したら閉じている）
  const panel = useToggle();
  const filters: Filters<S> = { ...search, q: keyword };
  const activeFilters = countActiveFilters(search, conditions);
  const filtering = keyword !== '' || activeFilters > 0;
  return {
    filters,
    /** サーバーに渡す絞り込み（取得のキーにもなる。`toListFilter`） */
    listFilter: toListFilter(filters),
    setKeyword,
    /** 絞り込みの変更。履歴には積まず置き換える */
    setFilters: (next: FiltersPatch<S>) => patchSearch(next, { replace: true }),
    /** キーワード以外で効いている絞り込みの数 */
    activeFilters,
    /** 空の一覧に出す文言。絞り込んでいれば「一致するものが無い」、いなければ「まだ無い」 */
    emptyMessage: (noun: string) =>
      filtering ? `一致する${noun}はありません` : `まだ${noun}はありません`,
    /** 詳細な絞り込みのフォーム（`FilterPanel`）を開いているか。開閉は絞り込みボタン */
    panelOpen: panel.value,
    togglePanel: panel.toggle,
  };
}
