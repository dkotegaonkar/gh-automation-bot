import { backoffSeconds } from './backoff';

describe('backoffSeconds', () => {
  it('doubles per attempt', () => {
    expect([1, 2, 3, 4].map(backoffSeconds)).toEqual([30, 60, 120, 240]);
  });

  it('caps at 15 minutes and tolerates bad input', () => {
    expect(backoffSeconds(20)).toBe(900);
    expect(backoffSeconds(0)).toBe(30);
  });
});
