/**
 * בדיקות פענוח קבצים.
 *
 * המוקד הוא בשתי הטעויות שעולות הכי ביוקר: פענוח תאריך הפוך
 * (יום/חודש מול חודש/יום) וזיהוי כיוון שגוי (הכנסה שנקלטת כהוצאה).
 */

// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { decodeBytes, stripInvisibles } from '../../import/encoding';
import { detectFormat, readTable } from '../../import/tabular';
import { detectMapping, isMappingUsable, looksLikeAmount, looksLikeDate } from '../../import/columnMapping';
import { parseAmountCell, parseDateCell, parseRows } from '../../import/rows';
import { ImportError, MAX_FILE_BYTES } from '../../import/types';
import {
  DEBIT_CREDIT_CSV,
  HEADERLESS_CSV,
  HTML_TABLE_XLS,
  MESSY_CSV,
  PREAMBLE_CSV,
  SEMICOLON_CSV,
  SIMPLE_CSV,
  TRAILING_MINUS_CSV,
  US_DATE_CSV,
  hebrewCp1255File,
  textFile,
} from './fixtures';

describe('קידוד', () => {
  it('מזהה UTF-8 רגיל', () => {
    const { text, encoding } = decodeBytes(new TextEncoder().encode('ארומה'));
    expect(text).toBe('ארומה');
    expect(encoding).toBe('utf-8');
  });

  it('מסיר BOM של UTF-8', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('תאריך')]);
    expect(decodeBytes(bytes).text).toBe('תאריך');
  });

  it('⭐ נופל חזרה ל-windows-1255 כשזה לא UTF-8 תקין', () => {
    const file = hebrewCp1255File('bank.csv', 'ארומה');
    const { text, encoding } = decodeBytes(file.bytes);
    expect(encoding).toBe('windows-1255');
    expect(text).toBe('ארומה');
  });

  it('מסיר תווי כיווניות בלתי-נראים', () => {
    expect(stripInvisibles('‏ארומה‎')).toBe('ארומה');
    expect(stripInvisibles('א ב')).toBe('א ב');
  });
});

describe('זיהוי פורמט', () => {
  it('מזהה HTML שמתחזה ל-xls לפי התוכן ולא לפי הסיומת', () => {
    expect(detectFormat(textFile('דוח.xls', HTML_TABLE_XLS))).toBe('html-table');
  });

  it('מזהה XLSX לפי חתימת ה-ZIP', () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    expect(detectFormat({ name: 'x.xlsx', bytes })).toBe('xlsx');
  });

  it('מזהה XLS בינארי לפי חתימת OLE2', () => {
    const bytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]);
    expect(detectFormat({ name: 'x.xls', bytes })).toBe('xls');
  });

  it('טקסט רגיל נחשב CSV', () => {
    expect(detectFormat(textFile('x.csv', SIMPLE_CSV))).toBe('csv');
  });
});

describe('פענוח תאריכים', () => {
  it('⭐ מפרש כברירת מחדל יום/חודש/שנה — הפורמט הישראלי', () => {
    expect(parseDateCell('05/08/2026')).toBe('2026-08-05');
    expect(parseDateCell('1.9.2026')).toBe('2026-09-01');
    expect(parseDateCell('05-08-2026')).toBe('2026-08-05');
  });

  it('⭐ מזהה פורמט אמריקאי כשהיום גדול מ-12', () => {
    expect(parseDateCell('12/25/2026')).toBe('2026-12-25');
    expect(parseDateCell('05/13/2026')).toBe('2026-05-13');
  });

  it('כשאין אי-בהירות — מנצח הפורמט הישראלי', () => {
    // ‎05/08 יכול להיות 5 באוגוסט או 8 במאי; בישראל זה 5 באוגוסט
    expect(parseDateCell('05/08/2026')).toBe('2026-08-05');
  });

  it('מזהה ISO לפי שנה בת ארבע ספרות בהתחלה', () => {
    expect(parseDateCell('2026-08-05')).toBe('2026-08-05');
  });

  it('משלים שנה דו-ספרתית', () => {
    expect(parseDateCell('05/08/26')).toBe('2026-08-05');
    expect(parseDateCell('05/08/99')).toBe('1999-08-05');
  });

  it('דוחה תאריך שלא קיים', () => {
    expect(parseDateCell('31/02/2026')).toBeNull(); // פברואר קצר מזה
    expect(parseDateCell('45/01/2026')).toBeNull(); // אין יום 45
    expect(parseDateCell('13/13/2026')).toBeNull(); // שני הערכים גדולים מ-12
    expect(parseDateCell('00/08/2026')).toBeNull();
  });

  it('דוחה טקסט שאינו תאריך', () => {
    expect(parseDateCell('')).toBeNull();
    expect(parseDateCell('לא תאריך')).toBeNull();
    expect(parseDateCell('5 באוגוסט')).toBeNull();
  });
});

describe('פענוח סכומים', () => {
  it('מפענח לאגורות בלי שגיאת float', () => {
    expect(parseAmountCell('64.00')).toBe(6400);
    expect(parseAmountCell('0.1')).toBe(10);
    expect(parseAmountCell('1,234.56')).toBe(123456);
    expect(parseAmountCell('₪89.90')).toBe(8990);
  });

  it('⭐ מזהה מינוס בסוף — מוסכמה בנקאית שקל לפספס', () => {
    expect(parseAmountCell('64.00-')).toBe(-6400);
    expect(parseAmountCell('1,234.50-')).toBe(-123450);
  });

  it('מזהה סוגריים כשלילי', () => {
    expect(parseAmountCell('(64.00)')).toBe(-6400);
  });

  it('מזהה מינוס בהתחלה ופלוס מפורש', () => {
    expect(parseAmountCell('-64')).toBe(-6400);
    expect(parseAmountCell('+2400')).toBe(240000);
  });

  it('חותך מעבר לשתי ספרות אחרי הנקודה', () => {
    expect(parseAmountCell('10.999')).toBe(1099);
  });

  it('דוחה מה שאינו מספר', () => {
    expect(parseAmountCell('')).toBeNull();
    expect(parseAmountCell('abc')).toBeNull();
    expect(parseAmountCell('₪')).toBeNull();
  });

  it('עזרי הזיהוי מבחינים בין תאריך לסכום', () => {
    expect(looksLikeDate('05/08/2026')).toBe(true);
    expect(looksLikeDate('64.00')).toBe(false);
    expect(looksLikeAmount('1,234.56')).toBe(true);
    expect(looksLikeAmount('ארומה')).toBe(false);
  });
});

describe('מיפוי עמודות', () => {
  it('מזהה כותרות עבריות סטנדרטיות', () => {
    const table = readTable(textFile('bank.csv', SIMPLE_CSV));
    const mapping = detectMapping(table.rows);
    expect(mapping.headerRowIndex).toBe(0);
    expect(mapping.roles).toEqual(['date', 'merchant', 'amount', 'balance']);
    expect(isMappingUsable(mapping)).toBe(true);
  });

  it('⭐ מזהה עמודות חובה וזכות נפרדות', () => {
    const table = readTable(textFile('bank.csv', DEBIT_CREDIT_CSV));
    const mapping = detectMapping(table.rows);
    expect(mapping.roles).toEqual(['date', 'merchant', 'debit', 'credit', 'balance']);
  });

  it('מדלג על שורות כותרת ולוגו לפני הנתונים', () => {
    const table = readTable(textFile('bank.csv', PREAMBLE_CSV));
    const mapping = detectMapping(table.rows);
    expect(mapping.roles).toEqual(['date', 'merchant', 'amount']);
    expect(parseRows(table.rows, mapping).rows).toHaveLength(2);
  });

  it('מנחש מהתוכן כשאין שורת כותרת', () => {
    const table = readTable(textFile('bank.csv', HEADERLESS_CSV));
    const mapping = detectMapping(table.rows);
    expect(mapping.headerRowIndex).toBeNull();
    expect(isMappingUsable(mapping)).toBe(true);
    expect(parseRows(table.rows, mapping).rows).toHaveLength(3);
  });

  it('מזהה נקודה-פסיק כמפריד', () => {
    const table = readTable(textFile('bank.csv', SEMICOLON_CSV));
    expect(detectMapping(table.rows).roles).toEqual(['date', 'merchant', 'amount']);
  });

  it('חתימת המיפוי יציבה בין קבצים מאותו בנק', () => {
    const a = detectMapping(readTable(textFile('a.csv', SIMPLE_CSV)).rows);
    const b = detectMapping(
      readTable(textFile('b.csv', SIMPLE_CSV.replace('05/08/2026', '05/09/2026'))).rows,
    );
    expect(a.signature).toBe(b.signature);
  });
});

describe('פענוח שורות', () => {
  it('מפענח עמודת סכום יחידה עם סימן', () => {
    const table = readTable(textFile('bank.csv', SIMPLE_CSV));
    const { rows } = parseRows(table.rows, detectMapping(table.rows));

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ date: '2026-08-05', amountAgorot: 6400, type: 'expense' });
    expect(rows[2]).toMatchObject({ date: '2026-08-01', amountAgorot: 240000, type: 'income' });
  });

  it('⭐ חובה = הוצאה, זכות = הכנסה', () => {
    const table = readTable(textFile('bank.csv', DEBIT_CREDIT_CSV));
    const result = parseRows(table.rows, detectMapping(table.rows));

    expect(result.hasDebitCredit).toBe(true);
    expect(result.rows.map((r) => r.type)).toEqual(['expense', 'expense', 'income']);
    expect(result.rows[2]?.amountAgorot).toBe(240000);
  });

  it('מינוס בסוף נקרא כהוצאה', () => {
    const table = readTable(textFile('bank.csv', TRAILING_MINUS_CSV));
    const { rows } = parseRows(table.rows, detectMapping(table.rows));
    expect(rows[0]).toMatchObject({ amountAgorot: 6400, type: 'expense' });
    expect(rows[1]).toMatchObject({ amountAgorot: 240000, type: 'income' });
  });

  it('⭐ מדווח שאין סימן שלילי כשכל הסכומים חיוביים', () => {
    const csv = 'תאריך,תיאור,סכום\n05/08/2026,ארומה,64.00\n04/08/2026,רמי לוי,152.50\n';
    const table = readTable(textFile('bank.csv', csv));
    const result = parseRows(table.rows, detectMapping(table.rows));

    // הפענוח מדווח עובדות; ההכרעה נעשית ב-`direction.ts`
    expect(result.hasDebitCredit).toBe(false);
    expect(result.sawNegativeAmount).toBe(false);
  });

  it('שומר יתרה מהדוח לאימות, בלי לשמור אותה כעסקה', () => {
    const table = readTable(textFile('bank.csv', SIMPLE_CSV));
    const { rows } = parseRows(table.rows, detectMapping(table.rows));
    expect(rows[0]?.statementBalanceAgorot).toBe(117600);
  });

  it('מנרמל שם בית עסק לצורך זיהוי חוזר', () => {
    const table = readTable(textFile('bank.csv', SIMPLE_CSV));
    const { rows } = parseRows(table.rows, detectMapping(table.rows));
    expect(rows[0]?.merchantNormalized).toBe('ארומה תל אביב');
  });

  it('תאריכים אמריקאיים מפוענחים נכון', () => {
    const table = readTable(textFile('bank.csv', US_DATE_CSV));
    const { rows } = parseRows(table.rows, detectMapping(table.rows));
    expect(rows.map((r) => r.date)).toEqual(['2026-05-08', '2026-12-25']);
  });
});

describe('⭐ דיווח על שורות שנכשלו', () => {
  it('קולט את התקינות ומדווח על כל אחת מהפגומות עם הסיבה', () => {
    const table = readTable(textFile('bank.csv', MESSY_CSV));
    const { rows, failures } = parseRows(table.rows, detectMapping(table.rows));

    expect(rows).toHaveLength(2); // ארומה + תקין
    expect(failures.map((f) => f.reason).sort()).toEqual([
      'invalid_amount',
      'invalid_date',
      'invalid_date',
      'missing_amount',
      'zero_amount',
    ]);
  });

  it('מדווח מספר שורה שמתאים לקובץ המקורי', () => {
    const table = readTable(textFile('bank.csv', MESSY_CSV));
    const { failures } = parseRows(table.rows, detectMapping(table.rows));
    // שורה 1 = כותרת, שורה 2 = ארומה, שורה 3 = "לא תאריך"
    expect(failures[0]?.sourceLine).toBe(3);
    expect(failures[0]?.rawPreview).toContain('לא תאריך');
  });
});

describe('טבלת HTML שמתחזה ל-Excel', () => {
  it('⭐ נקראת נכון, כולל בחירת הטבלה עם הנתונים', () => {
    const table = readTable(textFile('דוח.xls', HTML_TABLE_XLS));
    expect(table.format).toBe('html-table');

    const mapping = detectMapping(table.rows);
    expect(mapping.roles).toEqual(['date', 'merchant', 'debit', 'credit']);

    const { rows } = parseRows(table.rows, mapping);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ amountAgorot: 240000, type: 'income' });
  });
});

describe('הגנות על הקלט', () => {
  it('קובץ ריק נדחה', () => {
    expect(() => readTable({ name: 'x.csv', bytes: new Uint8Array(0) })).toThrow(ImportError);
  });

  it('קובץ בלי שורות נדחה', () => {
    expect(() => readTable(textFile('x.csv', '\n\n\n'))).toThrow(ImportError);
  });

  it('HTML בלי טבלה נדחה בהודעה ברורה', () => {
    expect(() => readTable(textFile('x.xls', '<html><body>אין כאן טבלה</body></html>'))).toThrow(
      /לא נמצאה טבלה/,
    );
  });

  it('קובץ בלי עמודות מזוהות אינו נחשב שמיש', () => {
    const table = readTable(textFile('x.csv', 'שלום,עולם\nא,ב\nג,ד\n'));
    expect(isMappingUsable(detectMapping(table.rows))).toBe(false);
  });

  it('מגבלת הגודל מוגדרת ב-5MB', () => {
    expect(MAX_FILE_BYTES).toBe(5 * 1024 * 1024);
  });
});
