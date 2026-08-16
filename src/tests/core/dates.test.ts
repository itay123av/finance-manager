import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  addMonthsToMonth,
  compareDates,
  dayOfMonth,
  dayOfWeek,
  daysInMonth,
  daysLeftInMonth,
  diffDays,
  eachMonth,
  formatDateHe,
  formatMonthHe,
  formatWeekdayHe,
  isBetween,
  isSummerMonth,
  isValidISODate,
  isValidISOMonth,
  makeISODate,
  maxDate,
  minDate,
  monthEnd,
  monthNumber,
  monthOf,
  monthStart,
  monthsBetween,
  parseISODate,
  todayInIsrael,
  weekEnd,
  weekStart,
} from '../../core/dates';

describe('ולידציה', () => {
  it('מקבל תאריכים תקינים', () => {
    expect(isValidISODate('2026-08-07')).toBe(true);
    expect(isValidISODate('2024-02-29')).toBe(true); // שנה מעוברת
  });

  it('דוחה תאריכים לא תקינים', () => {
    expect(isValidISODate('2026-13-01')).toBe(false);
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('2025-02-29')).toBe(false); // לא מעוברת
    expect(isValidISODate('2026-08-00')).toBe(false);
    expect(isValidISODate('07/08/2026')).toBe(false);
    expect(isValidISODate('')).toBe(false);
  });

  it('ולידציה לחודש', () => {
    expect(isValidISOMonth('2026-08')).toBe(true);
    expect(isValidISOMonth('2026-13')).toBe(false);
    expect(isValidISOMonth('2026-8')).toBe(false);
  });

  it('parseISODate זורק על קלט לא תקין', () => {
    expect(parseISODate('2026-08-07')).toEqual({ year: 2026, month: 8, day: 7 });
    expect(() => parseISODate('2026-02-30')).toThrow(/לא תקין/);
  });

  it('makeISODate מרפד באפסים', () => {
    expect(makeISODate(2026, 8, 7)).toBe('2026-08-07');
    expect(makeISODate(999, 1, 1)).toBe('0999-01-01');
  });
});

describe('אזור זמן — אין שעון קיץ שמזיז יום', () => {
  it('מתרגם רגע ליום הלוח שלו בישראל', () => {
    // 2026-08-06 22:00 UTC = 2026-08-07 01:00 בישראל (UTC+3 בקיץ)
    expect(todayInIsrael(new Date('2026-08-06T22:00:00Z'))).toBe('2026-08-07');
    // 2026-08-07 20:00 UTC = עדיין ה-7 באוגוסט בישראל (23:00)
    expect(todayInIsrael(new Date('2026-08-07T20:00:00Z'))).toBe('2026-08-07');
    // חורף: UTC+2
    expect(todayInIsrael(new Date('2026-01-15T22:30:00Z'))).toBe('2026-01-16');
    expect(todayInIsrael(new Date('2026-01-15T21:00:00Z'))).toBe('2026-01-15');
  });

  it('הוספת יום חוצה את מעבר שעון הקיץ בלי לדלג או להיתקע', () => {
    // בישראל שעון הקיץ מתחיל בסוף מרץ. במימוש מבוסס UTC-צהריים זה לא רלוונטי.
    expect(addDays('2026-03-26', 1)).toBe('2026-03-27');
    expect(addDays('2026-03-27', 1)).toBe('2026-03-28');
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25'); // סוף שעון קיץ
  });
});

describe('אריתמטיקת תאריכים', () => {
  it('addDays חוצה חודשים ושנים', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-08-07', 0)).toBe('2026-08-07');
  });

  it('addMonths מקצץ את יום החודש כשצריך', () => {
    // 31 בינואר + חודש = 28 בפברואר, לא 3 במרץ
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29'); // מעוברת
    expect(addMonths('2026-01-31', 3)).toBe('2026-04-30');
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
  });

  it('diffDays סימטרי ומדויק', () => {
    expect(diffDays('2026-08-01', '2026-08-07')).toBe(6);
    expect(diffDays('2026-08-07', '2026-08-01')).toBe(-6);
    expect(diffDays('2026-08-07', '2026-08-07')).toBe(0);
    expect(diffDays('2025-01-01', '2026-01-01')).toBe(365);
    expect(diffDays('2024-01-01', '2024-03-01')).toBe(60); // מעוברת
  });

  it('השוואות והשוואות טווח', () => {
    expect(compareDates('2026-08-01', '2026-08-07')).toBe(-1);
    expect(compareDates('2026-08-07', '2026-08-01')).toBe(1);
    expect(compareDates('2026-08-07', '2026-08-07')).toBe(0);
    expect(minDate('2026-08-01', '2026-08-07')).toBe('2026-08-01');
    expect(maxDate('2026-08-01', '2026-08-07')).toBe('2026-08-07');
  });

  it('isBetween כולל את שני הקצוות', () => {
    expect(isBetween('2026-08-01', '2026-08-01', '2026-08-31')).toBe(true);
    expect(isBetween('2026-08-31', '2026-08-01', '2026-08-31')).toBe(true);
    expect(isBetween('2026-07-31', '2026-08-01', '2026-08-31')).toBe(false);
    expect(isBetween('2026-09-01', '2026-08-01', '2026-08-31')).toBe(false);
  });
});

describe('חודשים', () => {
  it('גבולות חודש', () => {
    expect(monthOf('2026-08-07')).toBe('2026-08');
    expect(monthStart('2026-08-07')).toBe('2026-08-01');
    expect(monthEnd('2026-08-07')).toBe('2026-08-31');
    expect(monthEnd('2026-02-10')).toBe('2026-02-28');
    expect(monthEnd('2024-02-10')).toBe('2024-02-29');
    expect(monthEnd('2026-04')).toBe('2026-04-30');
  });

  it('אורך חודש וימים שנותרו', () => {
    expect(daysInMonth('2026-08')).toBe(31);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2024-02')).toBe(29);
    expect(dayOfMonth('2026-08-07')).toBe(7);
    expect(daysLeftInMonth('2026-08-07')).toBe(25);
    expect(daysLeftInMonth('2026-08-31')).toBe(1); // היום האחרון — נשאר יום אחד
    expect(daysLeftInMonth('2026-08-01')).toBe(31);
  });

  it('הזזת חודשים וספירה ביניהם', () => {
    expect(addMonthsToMonth('2026-08', 1)).toBe('2026-09');
    expect(addMonthsToMonth('2026-12', 1)).toBe('2027-01');
    expect(addMonthsToMonth('2026-01', -1)).toBe('2025-12');
    expect(monthsBetween('2026-01', '2026-08')).toBe(7);
    expect(monthsBetween('2026-08', '2027-08')).toBe(12);
    expect(monthsBetween('2026-08', '2026-08')).toBe(0);
    expect(monthNumber('2026-08')).toBe(8);
  });

  it('eachMonth כולל את שני הקצוות', () => {
    expect(eachMonth('2026-06', '2026-09')).toEqual(['2026-06', '2026-07', '2026-08', '2026-09']);
    expect(eachMonth('2026-08', '2026-08')).toEqual(['2026-08']);
  });

  it('חודשי הקיץ הם יולי ואוגוסט', () => {
    expect(isSummerMonth('2026-07')).toBe(true);
    expect(isSummerMonth('2026-08')).toBe(true);
    expect(isSummerMonth('2026-06')).toBe(false);
    expect(isSummerMonth('2026-09')).toBe(false);
  });
});

describe('שבועות — ראשון עד שבת', () => {
  it('dayOfWeek מחזיר 0 לראשון', () => {
    expect(dayOfWeek('2026-08-02')).toBe(0); // ראשון
    expect(dayOfWeek('2026-08-07')).toBe(5); // שישי
    expect(dayOfWeek('2026-08-08')).toBe(6); // שבת
  });

  it('weekStart ו-weekEnd', () => {
    expect(weekStart('2026-08-07')).toBe('2026-08-02');
    expect(weekEnd('2026-08-07')).toBe('2026-08-08');
    // ביום ראשון עצמו — השבוע מתחיל היום
    expect(weekStart('2026-08-02')).toBe('2026-08-02');
    // שבוע שחוצה חודש
    expect(weekStart('2026-09-01')).toBe('2026-08-30');
  });
});

describe('תצוגה בעברית', () => {
  it('פורמט תאריך ישראלי', () => {
    expect(formatDateHe('2026-08-07')).toBe('07/08/2026');
    expect(formatDateHe('2026-12-31')).toBe('31/12/2026');
  });

  it('שם חודש בעברית', () => {
    expect(formatMonthHe('2026-08')).toBe('אוגוסט 2026');
    expect(formatMonthHe('2027-03')).toBe('מרץ 2027');
    expect(() => formatMonthHe('2026-13')).toThrow();
  });

  it('שם יום בעברית', () => {
    expect(formatWeekdayHe('2026-08-02')).toBe('ראשון');
    expect(formatWeekdayHe('2026-08-08')).toBe('שבת');
  });
});
