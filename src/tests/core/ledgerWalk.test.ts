/**
 * ⭐ בדיקות הליכה על הדוח עסקה-עסקה.
 *
 * הבאג שנתפס מול קובץ בנק אמיתי: הקובץ היה מסודר **מהחדש לישן**,
 * והקוד לקח את "השורה האחרונה" כיתרת הסיום — כלומר דווקא את העסקה
 * הישנה ביותר. התוצאה הייתה פער מדומה של אלפי שקלים בהתאמה, על קובץ
 * שלמעשה היה תקין לחלוטין.
 *
 * שרשרת היתרות היא הוכחה חזקה יותר מכל בדיקת סכומים: אם כל חוליה
 * מתחברת לקודמת, גם הסכום, גם הסימן וגם הסדר פוענחו נכון.
 */

import { describe, expect, it } from 'vitest';
import { walkStatement, type StatementRow } from '../../core/reconcile';
import { ILS } from '../helpers';

/** דוח תקין, מהישן לחדש. פתיחה ₪1,000. */
const CHRONOLOGICAL: StatementRow[] = [
  { date: '2026-08-01', signedAmountAgorot: ILS(2400), statementBalanceAgorot: ILS(3400) },
  { date: '2026-08-03', signedAmountAgorot: ILS(-64), statementBalanceAgorot: ILS(3336) },
  { date: '2026-08-04', signedAmountAgorot: ILS(-152.5), statementBalanceAgorot: ILS(3183.5) },
];

describe('דוח מסודר מהישן לחדש', () => {
  it('מסיק את יתרת הפתיחה ואת תאריכה', () => {
    const walk = walkStatement(CHRONOLOGICAL);
    expect(walk.inferredOpeningBalanceAgorot).toBe(ILS(1000));
    expect(walk.openingDate).toBe('2026-08-01');
    expect(walk.chronological).toBe(true);
  });

  it('מזהה שרשרת תקינה ומחזיר את יתרת הסיום הנכונה', () => {
    const walk = walkStatement(CHRONOLOGICAL);
    expect(walk.consistent).toBe(true);
    expect(walk.breaks).toEqual([]);
    expect(walk.closingBalanceAgorot).toBe(ILS(3183.5));
  });
});

describe('⭐ דוח מסודר מהחדש לישן — המקרה שהפיל את ההתאמה', () => {
  const NEWEST_FIRST = [...CHRONOLOGICAL].reverse();

  it('מזהה את הכיוון ההפוך', () => {
    expect(walkStatement(NEWEST_FIRST).chronological).toBe(false);
  });

  it('⭐ יתרת הסיום היא של העסקה החדשה ביותר, לא של השורה האחרונה', () => {
    const walk = walkStatement(NEWEST_FIRST);
    // השורה האחרונה בקובץ היא העסקה הישנה ביותר, עם יתרה ₪3,400
    expect(NEWEST_FIRST.at(-1)!.statementBalanceAgorot).toBe(ILS(3400));
    // אבל יתרת הסיום האמיתית היא ₪3,183.50
    expect(walk.closingBalanceAgorot).toBe(ILS(3183.5));
  });

  it('יתרת הפתיחה זהה בשני הכיוונים', () => {
    expect(walkStatement(NEWEST_FIRST).inferredOpeningBalanceAgorot).toBe(ILS(1000));
    expect(walkStatement(NEWEST_FIRST).openingDate).toBe('2026-08-01');
  });

  it('השרשרת תקינה בשני הכיוונים', () => {
    expect(walkStatement(NEWEST_FIRST).consistent).toBe(true);
  });
});

describe('איתור שבירה בשרשרת', () => {
  it('מדווח בדיוק איפה היתרה קופצת', () => {
    const broken: StatementRow[] = [
      { date: '2026-08-01', signedAmountAgorot: ILS(2400), statementBalanceAgorot: ILS(3400) },
      // חסרה כאן עסקה של ‎-₪200
      { date: '2026-08-03', signedAmountAgorot: ILS(-64), statementBalanceAgorot: ILS(3136) },
      { date: '2026-08-04', signedAmountAgorot: ILS(-152.5), statementBalanceAgorot: ILS(2983.5) },
    ];
    const walk = walkStatement(broken);

    expect(walk.consistent).toBe(false);
    expect(walk.breaks).toHaveLength(1);
    expect(walk.breaks[0]).toMatchObject({
      index: 1,
      date: '2026-08-03',
      expectedAgorot: ILS(3336),
      actualAgorot: ILS(3136),
      driftAgorot: ILS(-200),
    });
  });

  it('סטייה של אגורה אינה נחשבת שבירה', () => {
    const walk = walkStatement([
      { date: '2026-08-01', signedAmountAgorot: ILS(100), statementBalanceAgorot: ILS(1100) },
      { date: '2026-08-02', signedAmountAgorot: ILS(50), statementBalanceAgorot: ILS(1150) + 1 },
    ]);
    expect(walk.consistent).toBe(true);
  });
});

describe('מקרי קצה', () => {
  it('דוח ריק לא מחזיר כלום', () => {
    const walk = walkStatement([]);
    expect(walk.inferredOpeningBalanceAgorot).toBeNull();
    expect(walk.openingDate).toBeNull();
    expect(walk.closingBalanceAgorot).toBeNull();
    expect(walk.consistent).toBe(false);
  });

  it('שורה בודדת — פתיחה נגזרת, שרשרת תקינה', () => {
    const walk = walkStatement([
      { date: '2026-08-01', signedAmountAgorot: ILS(-64), statementBalanceAgorot: ILS(936) },
    ]);
    expect(walk.inferredOpeningBalanceAgorot).toBe(ILS(1000));
    expect(walk.closingBalanceAgorot).toBe(ILS(936));
    expect(walk.consistent).toBe(true);
  });

  it('יתרה שיורדת מתחת לאפס נתמכת', () => {
    const walk = walkStatement([
      { date: '2026-08-01', signedAmountAgorot: ILS(-150), statementBalanceAgorot: ILS(-50) },
    ]);
    expect(walk.inferredOpeningBalanceAgorot).toBe(ILS(100));
  });
});
