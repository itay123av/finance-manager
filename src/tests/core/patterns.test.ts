import { describe, expect, it } from 'vitest';
import {
  categoryDrift,
  compareToPreviousMonth,
  detectAnomalies,
  smallPurchaseAccumulation,
  weekdayPattern,
} from '../../core/patterns';
import { DEFAULT_CATEGORIES } from '../../content/categories.seed';
import { ILS, tx } from '../helpers';

const TODAY = '2026-08-07';

describe('זיהוי עסקאות חריגות', () => {
  // סכומים מגוונים — קטגוריה שכל ערכיה זהים חסרת פיזור, ואז אי אפשר
  // לומר עליה דבר. המקרה הזה נבדק בנפרד למטה.
  const history = [40, 45, 50, 42, 48, 44, 46, 43].map((shekels, i) =>
    tx({ date: `2026-07-0${i + 1}`, shekels, categoryId: 'cat-food-out' }),
  );

  it('מזהה עסקה חריגה בקטגוריה עם מספיק היסטוריה', () => {
    const big = tx({ date: '2026-08-03', shekels: 250, categoryId: 'cat-food-out', merchant: 'מסעדה' });
    const found = detectAnomalies([...history, big], '2026-08-01', TODAY);
    expect(found).toHaveLength(1);
    expect(found[0]?.method).toBe('robust');
    expect(found[0]?.amountAgorot).toBe(ILS(250));
    expect(found[0]?.typicalAgorot).toBe(ILS(44.5));
  });

  it('לא מתריע על עסקה רגילה', () => {
    const normal = tx({ date: '2026-08-03', shekels: 52, categoryId: 'cat-food-out' });
    expect(detectAnomalies([...history, normal], '2026-08-01', TODAY)).toHaveLength(0);
  });

  it('⭐ לא מתריע על הפרש קטן בשקלים — הרצפה המוחלטת', () => {
    const tiny = [7, 8, 9, 8, 7, 9, 8, 8].map((shekels, i) =>
      tx({ date: `2026-07-0${i + 1}`, shekels, categoryId: 'cat-games' }),
    );
    const slightlyBigger = tx({ date: '2026-08-03', shekels: 12, categoryId: 'cat-games' });
    // סטטיסטית ₪12 מול ₪8 הוא ציון עמיד גבוה מאוד, אבל ההפרש הוא ₪4.
    // בלי הרצפה המוחלטת המערכת הייתה מציפה התראות חסרות ערך.
    expect(detectAnomalies([...tiny, slightlyBigger], '2026-08-01', TODAY)).toHaveLength(0);
  });

  it('בקטגוריה דלילה נדרשת קפיצה בוטה', () => {
    const sparse = [
      tx({ date: '2026-07-01', shekels: 40, categoryId: 'cat-clothes' }),
      tx({ date: '2026-07-15', shekels: 60, categoryId: 'cat-clothes' }),
    ];
    const big = tx({ date: '2026-08-03', shekels: 380, categoryId: 'cat-clothes', merchant: 'אוזניות' });
    const found = detectAnomalies([...sparse, big], '2026-08-01', TODAY);
    expect(found).toHaveLength(1);
    expect(found[0]?.method).toBe('sparse');
    expect(found[0]?.messageHe).toContain('הגדולה ביותר');
  });

  it('בקטגוריה דלילה — לא מתריע על סכום בינוני', () => {
    const sparse = [
      tx({ date: '2026-07-01', shekels: 40, categoryId: 'cat-clothes' }),
      tx({ date: '2026-07-15', shekels: 60, categoryId: 'cat-clothes' }),
    ];
    const medium = tx({ date: '2026-08-03', shekels: 130, categoryId: 'cat-clothes' });
    expect(detectAnomalies([...sparse, medium], '2026-08-01', TODAY)).toHaveLength(0);
  });

  it('העסקה הראשונה בקטגוריה לעולם לא חריגה — אין מול מה להשוות', () => {
    const first = tx({ date: '2026-08-03', shekels: 5000, categoryId: 'cat-new' });
    expect(detectAnomalies([first], '2026-08-01', TODAY)).toHaveLength(0);
  });

  it('עסקאות מאותו יום אינן הופכות להיסטוריה זו של זו, גם בקלט לא ממוין', () => {
    const old = tx({ date: '2026-07-01', shekels: 40, categoryId: 'cat-clothes' });
    const sameDayLarge = tx({ date: '2026-08-03', shekels: 1000, categoryId: 'cat-clothes' });
    const candidate = tx({ date: '2026-08-03', shekels: 200, categoryId: 'cat-clothes' });

    const found = detectAnomalies([candidate, sameDayLarge, old], '2026-08-01', TODAY);
    expect(found.map((row) => row.amountAgorot)).toEqual([ILS(1000), ILS(200)]);
  });

  it('כשכל ההיסטוריה זהה — לא ממציא חריגות', () => {
    const identical = ['01', '02', '03', '04', '05', '06', '07', '08'].map((d) =>
      tx({ date: `2026-07-${d}`, shekels: 50, categoryId: 'cat-transport' }),
    );
    const same = tx({ date: '2026-08-03', shekels: 50, categoryId: 'cat-transport' });
    expect(detectAnomalies([...identical, same], '2026-08-01', TODAY)).toHaveLength(0);
  });

  /**
   * ⭐ המסלול החלופי: היסטוריה שרובה זהה, עם חריג אחד.
   *
   * MAD מתאפס כשיותר מחצי מהערכים שווים — וזה קורה בפועל: נסיעה
   * באותו מחיר בכל יום, ופעם אחת נסיעה יקרה. במצב הזה החישוב העמיד
   * מתחלף בסטיית תקן רגילה, אחרת שום דבר לא היה מזוהה שוב לעולם
   * באותה קטגוריה.
   */
  it('⭐ כש-MAD מתאפס, החישוב נופל לסטיית תקן ועדיין מזהה חריגה', () => {
    const mostlyIdentical = [
      ...['01', '02', '03', '04', '05', '06', '07'].map((d) =>
        tx({ date: `2026-07-${d}`, shekels: 50, categoryId: 'cat-transport' }),
      ),
      tx({ date: '2026-07-08', shekels: 300, categoryId: 'cat-transport' }),
    ];
    const outlier = tx({ date: '2026-08-03', shekels: 500, categoryId: 'cat-transport' });

    const found = detectAnomalies([...mostlyIdentical, outlier], '2026-08-01', TODAY);
    expect(found).toHaveLength(1);
    expect(found[0]?.transactionId).toBe(outlier.id);
  });

  it('ממוין מהגדולה לקטנה', () => {
    const found = detectAnomalies(
      [
        ...history,
        tx({ date: '2026-08-02', shekels: 200, categoryId: 'cat-food-out' }),
        tx({ date: '2026-08-03', shekels: 400, categoryId: 'cat-food-out' }),
      ],
      '2026-08-01',
      TODAY,
    );
    expect(found[0]?.amountAgorot).toBeGreaterThan(found[1]!.amountAgorot);
  });
});

describe('סחיפת קטגוריות', () => {
  const history = ['2026-04', '2026-05', '2026-06', '2026-07'].flatMap((m) => [
    tx({ date: `${m}-10`, shekels: 100, categoryId: 'cat-food-out' }),
  ]);

  it('מזהה קטגוריה שגדלה', () => {
    const drift = categoryDrift(
      [...history, tx({ date: '2026-08-03', shekels: 280, categoryId: 'cat-food-out' })],
      DEFAULT_CATEGORIES,
      TODAY,
    );
    expect(drift).toHaveLength(1);
    expect(drift[0]?.direction).toBe('up');
    expect(drift[0]?.deltaAgorot).toBe(ILS(180));
    expect(drift[0]?.messageHe).toContain('יותר מהרגיל');
  });

  it('מזהה קטגוריה שקטנה — ומשבחת', () => {
    const drift = categoryDrift(
      [...history, tx({ date: '2026-08-03', shekels: 20, categoryId: 'cat-food-out' })],
      DEFAULT_CATEGORIES,
      TODAY,
    );
    expect(drift[0]?.direction).toBe('down');
    expect(drift[0]?.messageHe).toContain('יפה');
  });

  it('מתעלם משינוי קטן — אחרת כל חודש היה מלא ברעש', () => {
    const drift = categoryDrift(
      [...history, tx({ date: '2026-08-03', shekels: 110, categoryId: 'cat-food-out' })],
      DEFAULT_CATEGORIES,
      TODAY,
    );
    expect(drift).toHaveLength(0);
  });

  it('לא מדווח על קטגוריה בלי היסטוריה', () => {
    const drift = categoryDrift(
      [tx({ date: '2026-08-03', shekels: 500, categoryId: 'cat-clothes' })],
      DEFAULT_CATEGORIES,
      TODAY,
    );
    expect(drift).toHaveLength(0);
  });

  it('ממוין לפי גודל השינוי', () => {
    const transactions = [
      ...history,
      ...['2026-04', '2026-05', '2026-06', '2026-07'].map((m) =>
        tx({ date: `${m}-11`, shekels: 50, categoryId: 'cat-friends' }),
      ),
      tx({ date: '2026-08-03', shekels: 280, categoryId: 'cat-food-out' }),
      tx({ date: '2026-08-04', shekels: 130, categoryId: 'cat-friends' }),
    ];
    const drift = categoryDrift(transactions, DEFAULT_CATEGORIES, TODAY);
    expect(drift[0]?.categoryId).toBe('cat-food-out');
  });
});

describe('הצטברות רכישות קטנות', () => {
  it('מזהה כמה רכישות קטנות שהצטברו', () => {
    const transactions = [
      tx({ date: '2026-08-03', shekels: 22 }),
      tx({ date: '2026-08-04', shekels: 18 }),
      tx({ date: '2026-08-05', shekels: 25 }),
      tx({ date: '2026-08-06', shekels: 24 }),
    ];
    const result = smallPurchaseAccumulation(transactions, TODAY);
    expect(result?.count).toBe(4);
    expect(result?.totalAgorot).toBe(ILS(89));
    expect(result?.messageHe).toContain('₪89');
  });

  it('סכום נמוך מדי — לא מדווח', () => {
    const transactions = [tx({ date: '2026-08-05', shekels: 20 }), tx({ date: '2026-08-06', shekels: 20 })];
    expect(smallPurchaseAccumulation(transactions, TODAY)).toBeNull();
  });

  it('רכישה גדולה אחת אינה "הצטברות"', () => {
    expect(smallPurchaseAccumulation([tx({ date: '2026-08-05', shekels: 300 })], TODAY)).toBeNull();
  });

  it('מסתכל רק על החלון האחרון', () => {
    const old = [
      tx({ date: '2026-07-01', shekels: 24 }),
      tx({ date: '2026-07-02', shekels: 24 }),
      tx({ date: '2026-07-03', shekels: 24 }),
      tx({ date: '2026-07-04', shekels: 24 }),
    ];
    expect(smallPurchaseAccumulation(old, TODAY)).toBeNull();
  });
});

describe('דפוס ימי שבוע', () => {
  it('מזהה יום בולט', () => {
    const transactions = [
      tx({ date: '2026-08-02', shekels: 20 }), // ראשון
      tx({ date: '2026-08-03', shekels: 20 }), // שני
      tx({ date: '2026-08-04', shekels: 25 }), // שלישי
      tx({ date: '2026-08-07', shekels: 200 }), // שישי
    ];
    const result = weekdayPattern(transactions, '2026-08-01', '2026-08-08');
    expect(result.peak?.weekdayNameHe).toBe('שישי');
    expect(result.messageHe).toContain('שישי');
  });

  it('לא ממציא דפוס כשהפער לא בולט', () => {
    const transactions = [
      tx({ date: '2026-08-02', shekels: 50 }),
      tx({ date: '2026-08-03', shekels: 55 }),
      tx({ date: '2026-08-04', shekels: 45 }),
    ];
    expect(weekdayPattern(transactions, '2026-08-01', '2026-08-08').messageHe).toBeNull();
  });

  it('פחות מ-3 ימים עם נתונים — אין מסקנה', () => {
    const result = weekdayPattern([tx({ date: '2026-08-02', shekels: 50 })], '2026-08-01', '2026-08-08');
    expect(result.peak).toBeNull();
    expect(result.messageHe).toBeNull();
    expect(result.byWeekday).toHaveLength(7);
  });

  it('שמות הימים נכונים ובסדר', () => {
    const result = weekdayPattern([], '2026-08-01', '2026-08-08');
    expect(result.byWeekday.map((b) => b.weekdayNameHe)).toEqual([
      'ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת',
    ]);
  });
});

describe('השוואה לחודש הקודם', () => {
  it('מחשב את ההפרש', () => {
    const transactions = [
      tx({ date: '2026-07-10', shekels: 300 }),
      tx({ date: '2026-08-03', shekels: 400 }),
    ];
    const c = compareToPreviousMonth(transactions, TODAY);
    expect(c.previousMonthAgorot).toBe(ILS(300));
    expect(c.thisMonthAgorot).toBe(ILS(400));
    expect(c.deltaAgorot).toBe(ILS(100));
    expect(c.deltaPct).toBe(33);
    expect(c.messageHe).toContain('יותר');
  });

  it('פחות מהחודש הקודם', () => {
    const c = compareToPreviousMonth(
      [tx({ date: '2026-07-10', shekels: 300 }), tx({ date: '2026-08-03', shekels: 100 })],
      TODAY,
    );
    expect(c.messageHe).toContain('פחות');
  });

  it('בלי חודש קודם — אומר זאת במפורש, בלי לחלק באפס', () => {
    const c = compareToPreviousMonth([tx({ date: '2026-08-03', shekels: 100 })], TODAY);
    expect(c.hasPreviousData).toBe(false);
    expect(c.deltaPct).toBe(0);
    expect(c.messageHe).toContain('אין עדיין נתונים');
  });
});
