import type { CareType } from '../../../shared/validation/lemon.ts';

/**
 * 記録を 1 つのアイコンで代表させるときの優先順（先頭ほど優先）。
 * めったに起きないこと（収穫・開花・落果）ほど先にして、毎日の世話（葉水・水やり）に埋もれさせない。
 */
const CARE_TYPE_PRIORITY: readonly CareType[] = [
  'harvest',
  'bloom',
  'drop',
  'fertilize',
  'water',
  'mist',
];

/** 記録を代表する項目。項目を 1 つも持たない記録（メモ）は null */
export function leadingCareType(careTypes: readonly CareType[]): CareType | null {
  return CARE_TYPE_PRIORITY.find((t) => careTypes.includes(t)) ?? null;
}
