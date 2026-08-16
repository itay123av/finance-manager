import { describe, expect, it } from 'vitest';
import {
  clamp,
  iqr,
  mad,
  maxOf,
  mean,
  median,
  minOf,
  quantile,
  relativeVolatility,
  robustZScore,
  standardDeviation,
  sum,
} from '../../core/stats';

describe('בסיס', () => {
  it('מערך ריק מחזיר 0 בכל הפונקציות — לא NaN', () => {
    expect(sum([])).toBe(0);
    expect(mean([])).toBe(0);
    expect(median([])).toBe(0);
    expect(mad([])).toBe(0);
    expect(iqr([])).toBe(0);
    expect(quantile([], 0.5)).toBe(0);
    expect(standardDeviation([])).toBe(0);
    expect(relativeVolatility([])).toBe(0);
    expect(maxOf([])).toBe(0);
    expect(minOf([])).toBe(0);
    expect(robustZScore(5, [])).toBeNull();
  });

  it('median על מספר אי-זוגי וזוגי של ערכים', () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([5])).toBe(5);
  });

  it('median לא משנה את מערך הקלט', () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });

  it('quantile מוגבל לטווח 0–1', () => {
    expect(quantile([10, 20, 30], 0)).toBe(10);
    expect(quantile([10, 20, 30], 1)).toBe(30);
    expect(quantile([10, 20, 30], -5)).toBe(10);
    expect(quantile([10, 20, 30], 5)).toBe(30);
    expect(quantile([10, 20, 30, 40], 0.25)).toBeCloseTo(17.5);
  });

  it('clamp', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('maxOf ו-minOf', () => {
    expect(maxOf([3, 9, 1])).toBe(9);
    expect(minOf([3, 9, 1])).toBe(1);
    expect(maxOf([-3, -9])).toBe(-3);
  });
});

describe('עמידות לחריגים — הסיבה שבחרנו חציון ולא ממוצע', () => {
  const normalMonths = [30_000, 32_000, 28_000, 31_000, 29_000, 30_000];
  const withBigPurchase = [...normalMonths.slice(0, 5), 68_000];

  it('רכישה גדולה אחת מזיזה את הממוצע משמעותית', () => {
    const before = mean(normalMonths);
    const after = mean(withBigPurchase);
    expect(after - before).toBeGreaterThan(5_000); // יותר מ-₪50 לחודש
  });

  it('אותה רכישה כמעט לא מזיזה את החציון', () => {
    const before = median(normalMonths);
    const after = median(withBigPurchase);
    expect(Math.abs(after - before)).toBeLessThan(1_500); // פחות מ-₪15
  });
});

describe('MAD וציון עמיד', () => {
  it('mad מחשב חציון המרחקים מהחציון', () => {
    expect(mad([10, 10, 10])).toBe(0);
    expect(mad([1, 2, 3, 4, 5])).toBe(1);
  });

  it('מזהה חריגה אמיתית', () => {
    const history = [40, 45, 50, 42, 48, 44, 46, 43];
    const z = robustZScore(200, history);
    expect(z).not.toBeNull();
    expect(z as number).toBeGreaterThan(3.5);
  });

  it('לא מסמן ערך רגיל כחריג', () => {
    const history = [40, 45, 50, 42, 48, 44, 46, 43];
    const z = robustZScore(47, history);
    expect(z as number).toBeLessThan(3.5);
  });

  it('נופל לסטיית תקן כש-MAD אפס', () => {
    // רוב הערכים זהים → MAD = 0, אבל יש פיזור
    const history = [50, 50, 50, 50, 50, 50, 50, 90];
    const z = robustZScore(200, history);
    expect(z).not.toBeNull();
    expect(z as number).toBeGreaterThan(0);
  });

  it('מחזיר null כשאין שום פיזור — עדיף לא לענות מאשר לענות שגוי', () => {
    expect(robustZScore(50, [50, 50, 50, 50])).toBeNull();
  });

  it('standardDeviation', () => {
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
    expect(standardDeviation([5, 5, 5])).toBe(0);
  });
});

describe('תנודתיות יחסית', () => {
  it('הוצאות יציבות → תנודתיות נמוכה', () => {
    expect(relativeVolatility([30_000, 30_500, 29_800, 30_200])).toBeLessThan(0.1);
  });

  it('הוצאות מתנדנדות → תנודתיות גבוהה', () => {
    expect(relativeVolatility([10_000, 90_000, 20_000, 80_000])).toBeGreaterThan(0.5);
  });

  it('חציון אפס לא גורם לחלוקה באפס', () => {
    expect(relativeVolatility([0, 0, 0])).toBe(0);
  });
});
