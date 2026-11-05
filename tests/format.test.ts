import { describe, expect, it } from 'vitest';
import { formatCash, formatIncome, formatNumber, formatPearls } from '../src/game/economy';

describe('number formats (§2.1)', () => {
  it('cash below 1000 is a floored integer', () => {
    expect(formatCash(0)).toBe('$0');
    expect(formatCash(12.9)).toBe('$12');
    expect(formatCash(999.99)).toBe('$999');
  });

  it('3 significant digits with suffixes above 1000', () => {
    expect(formatNumber(1250)).toBe('1.25K');
    expect(formatNumber(12_500)).toBe('12.5K');
    expect(formatNumber(125_000)).toBe('125K');
    expect(formatNumber(1_000_000)).toBe('1M');
    expect(formatNumber(2_500_000_000)).toBe('2.5B');
    expect(formatNumber(999_600)).toBe('1M');
    expect(formatNumber(3e12)).toBe('3T');
  });

  it('income: one decimal below 10, integers to 999', () => {
    expect(formatIncome(1.24)).toBe('$1.2/s');
    expect(formatIncome(3)).toBe('$3/s');
    expect(formatIncome(42.7)).toBe('$42/s');
    expect(formatIncome(1500)).toBe('$1.5K/s');
  });

  it('pearls use thousands separators', () => {
    expect(formatPearls(1250)).toBe('1,250');
    expect(formatPearls(60)).toBe('60');
    expect(formatPearls(-3)).toBe('0');
  });
});
