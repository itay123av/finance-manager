import { describe, expect, it } from 'vitest';
import {
  capConfidenceByHorizon,
  confidenceExplanationHe,
  confidenceFromMonths,
  confidenceLabelHe,
  confidenceRank,
  horizonCap,
  minConfidence,
} from '../../core/confidence';

describe('רמת ביטחון לפי כמות חודשים — הכללים המחמירים', () => {
  it('0 חודשים → none (הממשק לא יציג מספר כלל)', () => {
    expect(confidenceFromMonths(0)).toBe('none');
    expect(confidenceFromMonths(-1)).toBe('none');
  });

  it('1–2 חודשים → low', () => {
    expect(confidenceFromMonths(1)).toBe('low');
    expect(confidenceFromMonths(2)).toBe('low');
  });

  it('3–5 חודשים → medium (ולא high, כפי שהיה בגרסה הראשונה)', () => {
    expect(confidenceFromMonths(3)).toBe('medium');
    expect(confidenceFromMonths(4)).toBe('medium');
    expect(confidenceFromMonths(5)).toBe('medium');
  });

  it('6 חודשים ומעלה → high', () => {
    expect(confidenceFromMonths(6)).toBe('high');
    expect(confidenceFromMonths(24)).toBe('high');
  });
});

describe('תקרה לפי מרחק התחזית', () => {
  it('חודש אחד — ללא תקרה', () => {
    expect(horizonCap(1)).toBe('high');
  });

  it('עד 3 חודשים — תקרת medium', () => {
    expect(horizonCap(2)).toBe('medium');
    expect(horizonCap(3)).toBe('medium');
  });

  it('מעל 3 חודשים — תקרת low', () => {
    expect(horizonCap(4)).toBe('low');
    expect(horizonCap(12)).toBe('low');
  });
});

describe('שילוב — נלקחת תמיד הרמה הנמוכה', () => {
  it('שנתיים של נתונים אבל תחזית ל-12 חודשים → low', () => {
    const result = capConfidenceByHorizon('high', 12);
    expect(result.confidence).toBe('low');
    expect(result.requiresFarHorizonWarning).toBe(true);
  });

  it('תחזית ל-12 חודשים לעולם לא high — בכל רמת נתונים', () => {
    for (const historical of ['none', 'low', 'medium', 'high'] as const) {
      expect(capConfidenceByHorizon(historical, 12).confidence).not.toBe('high');
    }
  });

  it('נתונים דלים גוברים גם על טווח קצר', () => {
    const result = capConfidenceByHorizon('low', 1);
    expect(result.confidence).toBe('low');
    expect(result.requiresFarHorizonWarning).toBe(false);
  });

  it('אין נתונים → none, בכל טווח', () => {
    expect(capConfidenceByHorizon('none', 1).confidence).toBe('none');
    expect(capConfidenceByHorizon('none', 12).confidence).toBe('none');
  });

  it('אזהרת טווח רחוק נדרשת רק מעל 6 חודשים', () => {
    expect(capConfidenceByHorizon('high', 6).requiresFarHorizonWarning).toBe(false);
    expect(capConfidenceByHorizon('high', 7).requiresFarHorizonWarning).toBe(true);
  });

  it('חצי שנה של נתונים ותחזית לחודש → high', () => {
    expect(capConfidenceByHorizon('high', 1).confidence).toBe('high');
  });
});

describe('עזרים', () => {
  it('דירוג', () => {
    expect(confidenceRank('none')).toBe(0);
    expect(confidenceRank('high')).toBe(3);
  });

  it('minConfidence', () => {
    expect(minConfidence('high', 'low')).toBe('low');
    expect(minConfidence('medium', 'high')).toBe('medium');
    expect(minConfidence('none', 'none')).toBe('none');
  });

  it('לכל רמה יש תווית והסבר בעברית', () => {
    for (const c of ['none', 'low', 'medium', 'high'] as const) {
      expect(confidenceLabelHe(c).length).toBeGreaterThan(0);
      expect(confidenceExplanationHe(c).length).toBeGreaterThan(0);
    }
  });
});
