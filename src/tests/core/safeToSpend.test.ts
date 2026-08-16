import { describe, expect, it } from 'vitest';
import {
  committedItemsRemaining,
  confirmedIncomeRemaining,
  isRecurringStillDueThisMonth,
  safeToSpend,
  type SafeToSpendInput,
} from '../../core/safeToSpend';
import { ILS, expectedIncome, plannedExpense, recurring } from '../helpers';

function baseInput(overrides: Partial<SafeToSpendInput> = {}): SafeToSpendInput {
  return {
    today: '2026-08-07',
    currentBalanceAgorot: ILS(1240),
    safetyBufferAgorot: ILS(500),
    plannedExpenses: [],
    recurringTransactions: [],
    expectedIncomes: [],
    reservedForFutureMonthsAgorot: 0,
    goalContributionAgorot: 0,
    goalSavedSoFarThisMonthAgorot: 0,
    plannedDiscretionarySpendAgorot: 0,
    ...overrides,
  };
}

describe('⭐⭐ כסף שמוקצה לחודשים הבאים אינו פנוי היום', () => {
  it('יתרה גבוהה אחרי הקיץ אינה כסף פנוי', () => {
    // התרחיש: 7 באוגוסט, נכנסה משכורת קיץ, ובחשבון ₪3,791.
    // בלי ההקצאה העתידית המערכת הייתה מאשרת להוציא כמעט הכל.
    const naive = safeToSpend(baseInput({ currentBalanceAgorot: ILS(3791) }));
    expect(naive.nowAgorot).toBe(ILS(3291));

    // עם הקצאה של ₪2,900 לתשעת החודשים הבאים ולכסף היעד:
    const correct = safeToSpend(
      baseInput({ currentBalanceAgorot: ILS(3791), reservedForFutureMonthsAgorot: ILS(2900) }),
    );
    expect(correct.nowAgorot).toBe(ILS(391));
  });

  it('הסכום השמור מופיע בפירוק', () => {
    const result = safeToSpend(baseInput({ reservedForFutureMonthsAgorot: ILS(300) }));
    expect(result.breakdown.reservedForFutureMonthsAgorot).toBe(ILS(300));
    const b = result.breakdown;
    expect(
      b.availableNowAgorot -
        b.committedLeftAgorot -
        b.reservedForFutureMonthsAgorot -
        b.goalDueThisMonthAgorot,
    ).toBe(b.resultAgorot);
  });

  it('ההתאוששות לא נוגעת בכסף של החודשים הבאים', () => {
    const result = safeToSpend(
      baseInput({
        currentBalanceAgorot: ILS(1000),
        safetyBufferAgorot: ILS(500),
        reservedForFutureMonthsAgorot: ILS(600),
        goalContributionAgorot: ILS(200),
      }),
    );
    // 1000 − 500 − 600 − 200 = −300
    expect(result.nowAgorot).toBe(ILS(-300));
    // דוחים רק את תרומת היעד: 500 − 0 − 600 = שלילי → 0
    expect(result.recoveryAgorot).toBe(0);
  });

  it('סכום שמור שלילי מטופל כאפס', () => {
    const result = safeToSpend(baseInput({ reservedForFutureMonthsAgorot: ILS(-500) }));
    expect(result.breakdown.reservedForFutureMonthsAgorot).toBe(0);
    expect(result.nowAgorot).toBe(ILS(740));
  });
});

describe('⭐ ההפרדה המרכזית: safeToSpendNow לא כולל הכנסה עתידית', () => {
  it('הכנסה ודאית שתיכנס החודש לא מוסיפה אגורה אחת ל-nowAgorot', () => {
    const withoutIncome = safeToSpend(baseInput());
    const withIncome = safeToSpend(
      baseInput({
        expectedIncomes: [
          expectedIncome({ certainty: 'confirmed', expectedDate: '2026-08-25', expectedAmountAgorot: ILS(450) }),
        ],
      }),
    );

    // זו הטענה שכל המערכת נשענת עליה
    expect(withIncome.nowAgorot).toBe(withoutIncome.nowAgorot);
    expect(withIncome.nowAgorot).toBe(ILS(740));
  });

  it('הכנסה ודאית כן נכנסת לתחזית, ורק לשם', () => {
    const result = safeToSpend(
      baseInput({
        expectedIncomes: [
          expectedIncome({ certainty: 'confirmed', expectedDate: '2026-08-25', expectedAmountAgorot: ILS(450) }),
        ],
      }),
    );
    expect(result.projection.confirmedIncomeLeftAgorot).toBe(ILS(450));
    expect(result.projection.byMonthEndAgorot).toBe(result.nowAgorot + ILS(450));
  });

  it('הכנסה likely ו-possible לא נכנסות אפילו לתחזית — מוצגות בנפרד', () => {
    const result = safeToSpend(
      baseInput({
        expectedIncomes: [
          expectedIncome({ certainty: 'likely', expectedAmountAgorot: ILS(180) }),
          expectedIncome({ certainty: 'possible', expectedAmountAgorot: ILS(120) }),
        ],
      }),
    );
    expect(result.projection.confirmedIncomeLeftAgorot).toBe(0);
    expect(result.projection.byMonthEndAgorot).toBe(result.nowAgorot);
    expect(result.projection.unconfirmedIncomeAgorot).toBe(ILS(300));
    expect(result.projection.unconfirmedIncomeItems).toHaveLength(2);
  });

  it('הכנסה שכבר התקבלה לא נספרת שוב', () => {
    const result = safeToSpend(
      baseInput({
        expectedIncomes: [expectedIncome({ certainty: 'confirmed', received: true })],
      }),
    );
    expect(result.projection.confirmedIncomeLeftAgorot).toBe(0);
  });

  it('הכנסה שתאריכה עבר לא נספרת בתחזית סוף החודש', () => {
    const result = safeToSpend(
      baseInput({
        expectedIncomes: [expectedIncome({ certainty: 'confirmed', expectedDate: '2026-08-03' })],
      }),
    );
    expect(result.projection.confirmedIncomeLeftAgorot).toBe(0);
  });

  it('הכנסה של החודש הבא לא נספרת בתחזית של החודש הזה', () => {
    const result = safeToSpend(
      baseInput({
        expectedIncomes: [expectedIncome({ certainty: 'confirmed', expectedDate: '2026-09-05' })],
      }),
    );
    expect(result.projection.confirmedIncomeLeftAgorot).toBe(0);
  });
});

describe('החישוב עצמו', () => {
  it('מנכה סכום ביטחון, התחייבויות ותרומה ליעד', () => {
    const result = safeToSpend(
      baseInput({
        currentBalanceAgorot: ILS(1240),
        safetyBufferAgorot: ILS(500),
        plannedExpenses: [plannedExpense({ amountAgorot: ILS(240), dueDate: '2026-08-25' })],
        goalContributionAgorot: ILS(300),
        goalSavedSoFarThisMonthAgorot: ILS(140),
      }),
    );
    // 1240 − 500 − 240 − (300−140) = 340
    expect(result.nowAgorot).toBe(ILS(340));
    expect(result.breakdown.availableNowAgorot).toBe(ILS(740));
    expect(result.breakdown.committedLeftAgorot).toBe(ILS(240));
    expect(result.breakdown.goalDueThisMonthAgorot).toBe(ILS(160));
  });

  it('הפירוק מסתכם בדיוק לתוצאה — זו הטבלה שמוצגת למשתמש', () => {
    const result = safeToSpend(
      baseInput({
        plannedExpenses: [plannedExpense({ amountAgorot: ILS(240) })],
        goalContributionAgorot: ILS(300),
      }),
    );
    const b = result.breakdown;
    expect(b.currentBalanceAgorot - b.safetyBufferAgorot).toBe(b.availableNowAgorot);
    expect(b.availableNowAgorot - b.committedLeftAgorot - b.goalDueThisMonthAgorot).toBe(
      b.resultAgorot,
    );
    expect(b.resultAgorot).toBe(result.nowAgorot);
  });

  it('תרומה ליעד שכבר הושגה במלואה לא מנוכה שוב', () => {
    const result = safeToSpend(
      baseInput({ goalContributionAgorot: ILS(300), goalSavedSoFarThisMonthAgorot: ILS(500) }),
    );
    expect(result.breakdown.goalDueThisMonthAgorot).toBe(0);
  });

  it('הוצאה בעדיפות want אינה התחייבות ולא מנוכה', () => {
    const result = safeToSpend(
      baseInput({
        plannedExpenses: [
          plannedExpense({ amountAgorot: ILS(300), priority: 'want' }),
          plannedExpense({ amountAgorot: ILS(100), priority: 'must' }),
        ],
      }),
    );
    expect(result.breakdown.committedLeftAgorot).toBe(ILS(100));
  });

  it('הוצאה מתוכננת ששולמה כבר לא מנוכה', () => {
    const result = safeToSpend(
      baseInput({ plannedExpenses: [plannedExpense({ amountAgorot: ILS(300), paid: true })] }),
    );
    expect(result.breakdown.committedLeftAgorot).toBe(0);
  });
});

describe('ההקצאה השבועית נגזרת מ-now, לעולם לא מהתחזית', () => {
  it('שבועי = now / ימים שנותרו × 7', () => {
    // 7 באוגוסט → נשארו 25 ימים
    const result = safeToSpend(baseInput({ currentBalanceAgorot: ILS(1250), safetyBufferAgorot: ILS(500) }));
    expect(result.daysLeftInMonth).toBe(25);
    expect(result.nowAgorot).toBe(ILS(750));
    expect(result.weekAgorot).toBe(ILS(210)); // 750/25 = 30 ליום × 7
  });

  it('הכנסה ודאית לא מגדילה את ההקצאה השבועית', () => {
    const withIncome = safeToSpend(
      baseInput({ expectedIncomes: [expectedIncome({ expectedAmountAgorot: ILS(1000) })] }),
    );
    const without = safeToSpend(baseInput());
    expect(withIncome.weekAgorot).toBe(without.weekAgorot);
  });

  it('בסוף החודש מכסה רק את הימים שנותרו', () => {
    const result = safeToSpend(baseInput({ today: '2026-08-29' }));
    expect(result.daysLeftInMonth).toBe(3);
    expect(result.daysCovered).toBe(3);
  });

  it('ביום הראשון של החודש', () => {
    const result = safeToSpend(baseInput({ today: '2026-08-01' }));
    expect(result.daysLeftInMonth).toBe(31);
    expect(result.daysCovered).toBe(7);
  });

  it('כשאין מה להוציא, ההקצאה השבועית היא אפס ולא מספר שלילי', () => {
    const result = safeToSpend(baseInput({ currentBalanceAgorot: ILS(100), safetyBufferAgorot: ILS(500) }));
    expect(result.nowAgorot).toBeLessThan(0);
    expect(result.weekAgorot).toBe(0);
  });
});

describe('חריגה — בלי מספר שלילי חשוף ובלי טון שיפוטי', () => {
  it('מזהה חריגה ומחשב סכום התאוששות', () => {
    const result = safeToSpend(
      baseInput({
        currentBalanceAgorot: ILS(700),
        safetyBufferAgorot: ILS(500),
        goalContributionAgorot: ILS(400),
      }),
    );
    // 700 − 500 − 0 − 400 = −200
    expect(result.nowAgorot).toBe(ILS(-200));
    expect(result.isOverspent).toBe(true);
    expect(result.overspentByAgorot).toBe(ILS(200));
    // דוחים את תרומת היעד → עדיין אפשר להוציא 200
    expect(result.recoveryAgorot).toBe(ILS(200));
    expect(result.messageHe).toContain('לחזור למסלול');
    // הסכום מוצג כערך חיובי. מינוס אחרי רווח או בתחילת המחרוזת היה מסגיר
    // מספר שלילי חשוף — המקף ב"ב-₪200" הוא מקף חיבור בעברית ולא סימן מינוס.
    expect(result.messageHe).toContain('חרגת ב-₪200');
    expect(result.messageHe).not.toMatch(/(^|\s)[-−]\s*₪/);
  });

  it('כשגם ההתאוששות אפס — מסביר שהכסף מיועד להתחייבויות', () => {
    const result = safeToSpend(
      baseInput({
        currentBalanceAgorot: ILS(600),
        safetyBufferAgorot: ILS(500),
        plannedExpenses: [
          plannedExpense({ label: 'ספרי לימוד', amountAgorot: ILS(240), dueDate: '2026-08-25' }),
        ],
      }),
    );
    expect(result.recoveryAgorot).toBe(0);
    expect(result.headlineHe).toContain('מתוכננות');
    expect(result.messageHe).toContain('ספרי לימוד');
  });

  it('חריגה בלי התחייבויות כלל — מפנה לסכום הביטחון', () => {
    const result = safeToSpend(
      baseInput({ currentBalanceAgorot: ILS(400), safetyBufferAgorot: ILS(500) }),
    );
    expect(result.recoveryAgorot).toBe(0);
    expect(result.messageHe).toContain('סכום הביטחון');
  });

  it('אפס בדיוק אינו חריגה', () => {
    const result = safeToSpend(
      baseInput({ currentBalanceAgorot: ILS(500), safetyBufferAgorot: ILS(500) }),
    );
    expect(result.nowAgorot).toBe(0);
    expect(result.isOverspent).toBe(false);
  });
});

describe('הוצאות חוזרות', () => {
  it('מנוי שטרם חויב החודש נחשב התחייבות', () => {
    expect(isRecurringStillDueThisMonth(recurring({ dayOfCycle: 12 }), '2026-08-07')).toBe(true);
  });

  it('מנוי שכבר חויב החודש לא מנוכה פעמיים', () => {
    const sub = recurring({ dayOfCycle: 12, lastSeenDate: '2026-08-12' });
    expect(isRecurringStillDueThisMonth(sub, '2026-08-15')).toBe(false);
  });

  it('מנוי שתאריך החיוב שלו כבר עבר החודש לא נספר', () => {
    expect(isRecurringStillDueThisMonth(recurring({ dayOfCycle: 5 }), '2026-08-07')).toBe(false);
  });

  it('יום 31 בחודש בן 30 יום נגבה ביום האחרון', () => {
    expect(isRecurringStillDueThisMonth(recurring({ dayOfCycle: 31 }), '2026-04-30')).toBe(true);
    expect(isRecurringStillDueThisMonth(recurring({ dayOfCycle: 31 }), '2026-09-30')).toBe(true);
  });

  it('מנוי לא פעיל, הכנסה חוזרת, או תדירות אחרת — לא נספרים', () => {
    expect(isRecurringStillDueThisMonth(recurring({ active: false }), '2026-08-07')).toBe(false);
    expect(isRecurringStillDueThisMonth(recurring({ type: 'income' }), '2026-08-07')).toBe(false);
    expect(isRecurringStillDueThisMonth(recurring({ frequency: 'yearly' }), '2026-08-07')).toBe(false);
  });

  it('מנוי נכנס לרשימת ההתחייבויות ומנוכה מ-now', () => {
    const result = safeToSpend(
      baseInput({ recurringTransactions: [recurring({ label: 'Spotify', amountAgorot: ILS(22) })] }),
    );
    expect(result.breakdown.committedLeftAgorot).toBe(ILS(22));
    expect(result.breakdown.committedItems[0]?.kind).toBe('recurring');
  });
});

describe('פונקציות עזר', () => {
  it('committedItemsRemaining ממיין לפי תאריך', () => {
    const items = committedItemsRemaining(
      [
        plannedExpense({ label: 'מאוחר', dueDate: '2026-08-28' }),
        plannedExpense({ label: 'מוקדם', dueDate: '2026-08-10' }),
      ],
      [],
      '2026-08-07',
    );
    expect(items.map((i) => i.label)).toEqual(['מוקדם', 'מאוחר']);
  });

  it('confirmedIncomeRemaining ממיין לפי תאריך צפוי', () => {
    const items = confirmedIncomeRemaining(
      [
        expectedIncome({ label: 'שני', expectedDate: '2026-08-28' }),
        expectedIncome({ label: 'ראשון', expectedDate: '2026-08-12' }),
      ],
      '2026-08-07',
    );
    expect(items.map((i) => i.label)).toEqual(['ראשון', 'שני']);
  });

  it('תחזית היתרה בסוף החודש מנכה הוצאה פנויה מתוכננת', () => {
    const result = safeToSpend(
      baseInput({
        currentBalanceAgorot: ILS(1240),
        expectedIncomes: [expectedIncome({ expectedAmountAgorot: ILS(450) })],
        plannedExpenses: [plannedExpense({ amountAgorot: ILS(240) })],
        plannedDiscretionarySpendAgorot: ILS(300),
      }),
    );
    expect(result.projection.monthEndBalanceAgorot).toBe(ILS(1150)); // 1240+450−240−300
  });
});
