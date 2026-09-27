import { expect, test } from 'vitest';
import { mapSearchUrl } from '../map-search-url.ts';

test('iOS では Apple のマップ、それ以外では Google マップで場所の文字列をそのまま検索する', () => {
  expect(mapSearchUrl('東京駅 丸の内口', true)).toBe(
    'https://maps.apple.com/search?query=%E6%9D%B1%E4%BA%AC%E9%A7%85%20%E4%B8%B8%E3%81%AE%E5%86%85%E5%8F%A3',
  );
  expect(mapSearchUrl('A&B', false)).toBe('https://www.google.com/maps/search/?api=1&query=A%26B');
});
