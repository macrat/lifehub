/**
 * 並びの id の要素を next にした並び。無ければ末尾に足し、next が null なら除く
 * （シートで保存・削除した 1 件を、サーバーが返すのと同じ並びに先回りして入れる）
 */
export function putById<T extends { id: string }>(
  list: readonly T[],
  id: string,
  next: T | null,
): T[] {
  if (!list.some((item) => item.id === id)) return next ? [...list, next] : [...list];
  return list.flatMap((item) => (item.id !== id ? [item] : next ? [next] : []));
}
