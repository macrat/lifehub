/**
 * ホーム画面のカード。各 feature の dashboard.ts が実装し、registry.ts に列挙する。
 * ホームは feature を知らず、カードの並びは order で決まる。
 */
export type DashboardWidget<Id extends string = string, Data = unknown> = {
  id: Id;
  order: number;
  load: (ctx: { userId: string; now: Date }) => Promise<Data>;
};

export function defineWidget<Id extends string, Data>(
  widget: DashboardWidget<Id, Data>,
): DashboardWidget<Id, Data> {
  return widget;
}

export type CardOf<W> =
  W extends DashboardWidget<infer Id, infer Data> ? { id: Id; order: number; data: Data } : never;
