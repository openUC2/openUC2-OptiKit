import { describe, expect, it } from 'vitest';
import { parseDecimal } from '../parseDecimal';

describe('parseDecimal (WP-92: decimal-comma inputs)', () => {
  it('parses dot decimals', () => {
    expect(parseDecimal('0.15')).toBe(0.15);
    expect(parseDecimal('-22.28')).toBe(-22.28);
  });

  it('parses comma decimals (German locale)', () => {
    expect(parseDecimal('0,15')).toBe(0.15);
    expect(parseDecimal('-3,5')).toBe(-3.5);
    expect(parseDecimal(' 1,0 ')).toBe(1);
  });

  it('parses integers and scientific notation', () => {
    expect(parseDecimal('42')).toBe(42);
    expect(parseDecimal('1e3')).toBe(1000);
    expect(parseDecimal('1,5e2')).toBe(150);
  });

  it('rejects incomplete or malformed text', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('   ')).toBeNull();
    expect(parseDecimal('-')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('1,2,3')).toBeNull();
    expect(parseDecimal('1.2.3')).toBeNull();
  });

  it('rejects non-finite values', () => {
    expect(parseDecimal('Infinity')).toBeNull();
    expect(parseDecimal('NaN')).toBeNull();
  });

  it('accepts trailing-separator intermediates as their prefix', () => {
    expect(parseDecimal('1.')).toBe(1);
    expect(parseDecimal('1,')).toBe(1);
  });
});
