/** 下限と上限の間に収める。範囲を外れた値は端で止める */
export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
