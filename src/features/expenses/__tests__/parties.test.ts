import { describe, expect, it } from 'vitest';
import { chooseFrom } from '../parties.ts';

describe('chooseFrom', () => {
  it('To と違う人なら From だけを変える', () => {
    expect(chooseFrom({ to: null, from: 'a' }, 'b')).toEqual({ to: null, from: 'b' });
    expect(chooseFrom({ to: 'c', from: 'a' }, 'b')).toEqual({ to: 'c', from: 'b' });
  });

  it('To にいる人を選んだら To と From を入れ替える', () => {
    expect(chooseFrom({ to: 'b', from: 'a' }, 'b')).toEqual({ to: 'a', from: 'b' });
  });
});
