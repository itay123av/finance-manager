import { describe, expect, it } from 'vitest';
import { assessRisk, type RiskInput } from '../../core/risk';
import { ILS } from '../helpers';

function input(overrides: Partial<RiskInput> = {}): RiskInput {
  return {
    plannedMonthlySpendAgorot: ILS(360),
    historicalMonthlySpendAgorot: ILS(400),
    monthlySpendHistory: [ILS(390), ILS(400), ILS(410), ILS(400), ILS(395), ILS(405)],
    unconfirmedIncomeShare: 0,
    monthsOfData: 6,
    ...overrides,
  };
}

describe('רמות סיכון', () => {
  it('תקציב קרוב להרגל, הוצאות יציבות → סיכון נמוך', () => {
    const r = assessRisk(input());
    expect(r.level).toBe('low');
    expect(r.summaryHe).toContain('סיכוי טוב');
  });

  it('תקציב שדורש לחתוך חצי → סיכון גבוה', () => {
    const r = assessRisk(input({ plannedMonthlySpendAgorot: ILS(160) }));
    expect(r.level).toBe('high');
    expect(r.primaryReasonHe).toContain('לצמצם');
    expect(r.primaryReasonHe).toContain('60%');
  });

  it('הוצאות מתנדנדות מאוד מעלות את הסיכון', () => {
    const stable = assessRisk(input());
    const volatile = assessRisk(
      input({ monthlySpendHistory: [ILS(100), ILS(900), ILS(150), ILS(850), ILS(200)] }),
    );
    expect(volatile.score).toBeGreaterThan(stable.score);
  });

  it('תלות בהכנסה לא ודאית מעלה את הסיכון', () => {
    const r = assessRisk(input({ unconfirmedIncomeShare: 1 }));
    expect(r.factors.unconfirmedIncome).toBe(1);
    expect(r.score).toBeGreaterThan(assessRisk(input()).score);
  });

  it('מיעוט נתונים נספר כגורם סיכון', () => {
    expect(assessRisk(input({ monthsOfData: 2 })).factors.thinData).toBe(1);
    expect(assessRisk(input({ monthsOfData: 3 })).factors.thinData).toBe(0);
  });
});

describe('הסיבה העיקרית — זה מה שמוצג למשתמש', () => {
  it('מזהה את הגורם הכבד ביותר', () => {
    expect(assessRisk(input({ plannedMonthlySpendAgorot: ILS(100) })).primaryReasonHe).toContain(
      'לצמצם',
    );
    expect(
      assessRisk(input({ unconfirmedIncomeShare: 1, plannedMonthlySpendAgorot: ILS(400) }))
        .primaryReasonHe,
    ).toContain('לא בטוחה');
    expect(
      assessRisk(
        input({
          plannedMonthlySpendAgorot: ILS(400),
          monthlySpendHistory: [ILS(50), ILS(900), ILS(60), ILS(850)],
        }),
      ).primaryReasonHe,
    ).toContain('משתנות');
  });

  it('כשאין שום גורם סיכון — אומר שהתקציב קרוב למציאות', () => {
    const r = assessRisk(
      input({
        plannedMonthlySpendAgorot: ILS(400),
        monthlySpendHistory: [ILS(400), ILS(400), ILS(400)],
        monthsOfData: 6,
      }),
    );
    expect(r.score).toBe(0);
    expect(r.primaryReasonHe).toContain('קרוב למה שאתה כבר עושה');
  });

  it('מיעוט נתונים כגורם יחיד', () => {
    const r = assessRisk(
      input({
        plannedMonthlySpendAgorot: ILS(400),
        monthlySpendHistory: [ILS(400)],
        monthsOfData: 1,
      }),
    );
    expect(r.primaryReasonHe).toContain('מספיק חודשים');
  });
});

describe('מקרי קצה', () => {
  it('היסטוריה ריקה לא מפילה את החישוב', () => {
    const r = assessRisk(input({ historicalMonthlySpendAgorot: 0, monthlySpendHistory: [] }));
    expect(Number.isFinite(r.score)).toBe(true);
    expect(r.factors.cutRequired).toBe(0);
  });

  it('תקציב גדול מההרגל — אין דרישת צמצום', () => {
    expect(assessRisk(input({ plannedMonthlySpendAgorot: ILS(900) })).factors.cutRequired).toBe(0);
  });

  it('חלקי הכנסה מחוץ לטווח נחתכים ל-0..1', () => {
    expect(assessRisk(input({ unconfirmedIncomeShare: 5 })).factors.unconfirmedIncome).toBe(1);
    expect(assessRisk(input({ unconfirmedIncomeShare: -2 })).factors.unconfirmedIncome).toBe(0);
  });

  it('לכל רמה יש סיכום בעברית', () => {
    for (const planned of [ILS(400), ILS(280), ILS(100)]) {
      const r = assessRisk(input({ plannedMonthlySpendAgorot: planned }));
      expect(r.summaryHe.length).toBeGreaterThan(0);
    }
  });
});
