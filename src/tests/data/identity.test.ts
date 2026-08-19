/**
 * גזירת הזהות מקוד החיבור.
 *
 * ⚠️ **הבדיקה המרכזית: מה שהשרת מקבל לא מוביל למפתח ההצפנה.**
 *
 * הקוד היחיד שהמשתמש מקליד מייצר גם את פרטי ההתחברות וגם את מפתח
 * ההצפנה. אם מישהו יחליף בטעות שני ערכים, או ישלח את הקוד הגולמי
 * כסיסמה, השרת יקבל את החומר שממנו נגזר המפתח — וכל ההצפנה תהפוך
 * לחסרת ערך בלי ששום דבר ייראה שבור.
 */

import { describe, expect, it } from 'vitest';
import { deriveIdentity } from '../../data/sync/identity';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  formatPairingCode,
  generatePairingCode,
  isValidPairingCode,
  normalizePairingCode,
} from '../../core/pairingCode';

const CODE = 'ABCD2345EFGH6789';

describe('הקוד עצמו', () => {
  it('נוצר באורך הנכון ומהאלפבית המותר', () => {
    const bytes = new Uint8Array(32).map((_, i) => i * 7);
    const code = generatePairingCode(bytes);
    expect(code).toHaveLength(CODE_LENGTH);
    expect([...code].every((c) => CODE_ALPHABET.includes(c))).toBe(true);
  });

  it('⭐ אין באלפבית תווים שמתבלבלים בהעתקה', () => {
    for (const confusing of ['I', 'L', 'O', 'U']) {
      expect(CODE_ALPHABET).not.toContain(confusing);
    }
  });

  it('⭐ אקראיות שונה נותנת קודים שונים', () => {
    const a = generatePairingCode(new Uint8Array(32).map((_, i) => i));
    const b = generatePairingCode(new Uint8Array(32).map((_, i) => i + 1));
    expect(a).not.toBe(b);
  });

  it('בלי מספיק אקראיות נכשל במקום לייצר קוד חלש', () => {
    expect(() => generatePairingCode(new Uint8Array(4))).toThrow();
  });

  /**
   * ⭐ מי שמעתיק קוד מהמסך לטלפון יקליד `O` במקום `0`. להיכשל על
   * זה זו חוויה גרועה בלי שום רווח באבטחה.
   */
  it('⭐ טעויות העתקה נפוצות מתוקנות', () => {
    expect(normalizePairingCode('abcd-2345-efgh-6789')).toBe(CODE);
    expect(normalizePairingCode('ABCD2345EFGH6789')).toBe(CODE);
    // O→0, I→1, L→1
    expect(normalizePairingCode('OBCD2345EFGH6789')).toBe('0BCD2345EFGH6789');
    expect(normalizePairingCode('IBCD2345EFGH6789')).toBe('1BCD2345EFGH6789');
  });

  it('אורך שגוי נדחה', () => {
    expect(isValidPairingCode('ABC')).toBe(false);
    expect(isValidPairingCode(CODE + 'X')).toBe(false);
    expect(isValidPairingCode(CODE)).toBe(true);
  });

  it('התצוגה מקובצת לקריאה', () => {
    expect(formatPairingCode(CODE)).toBe('ABCD-2345-EFGH-6789');
  });
});

describe('גזירה', () => {
  it('⭐ אותו קוד → אותה זהות בדיוק (זה מה שמחבר שני מכשירים)', async () => {
    const a = await deriveIdentity(CODE);
    const b = await deriveIdentity(CODE);
    expect(a).toEqual(b);
  });

  it('⭐ הגזירה עמידה לפורמט — מקפים ואותיות קטנות לא משנים כלום', async () => {
    const plain = await deriveIdentity(CODE);
    const pretty = await deriveIdentity('abcd-2345-efgh-6789');
    expect(pretty).toEqual(plain);
  });

  it('קוד אחר → זהות אחרת לגמרי', async () => {
    const a = await deriveIdentity(CODE);
    const b = await deriveIdentity('ZZZZ2345EFGH6789');
    expect(a.email).not.toBe(b.email);
    expect(a.password).not.toBe(b.password);
    expect(a.passphrase).not.toBe(b.passphrase);
  });

  /**
   * ⭐ הבדיקה שבגללה הקובץ קיים.
   *
   * השרת מקבל `email` ו-`password`. אם אחד מהם שווה ל-`passphrase`
   * או לקוד עצמו — השרת יכול לפענח את הנתונים, וההצפנה מקצה לקצה
   * היא שקר.
   */
  it('⭐ מה שנשלח לשרת אינו מכיל את מפתח ההצפנה ואינו הקוד', async () => {
    const id = await deriveIdentity(CODE);

    expect(id.password).not.toBe(id.passphrase);
    expect(id.email).not.toContain(id.passphrase);
    expect(id.password).not.toContain(id.passphrase);

    // ⭐ והקוד הגולמי עצמו לא נשלח בשום צורה
    expect(id.password).not.toContain(CODE);
    expect(id.email).not.toContain(CODE);
  });

  it('⭐ מפתח ההצפנה ארוך מספיק לשמש כסיסמת vault', async () => {
    const { MIN_SYNC_PASSPHRASE_LENGTH } = await import('../../data/sync/vault');
    const id = await deriveIdentity(CODE);
    expect(id.passphrase.length).toBeGreaterThanOrEqual(MIN_SYNC_PASSPHRASE_LENGTH);
  });

  it('האימייל מסונתז ואינו כתובת אמיתית', async () => {
    const id = await deriveIdentity(CODE);
    expect(id.email).toMatch(/^s[0-9a-f]{24}@device\.local$/);
  });

  /**
   * ⭐ שני הערכים שנשלחים לשרת נגזרים בנפרד. אין ביניהם קשר שאפשר
   * להפוך — אחרת מי שמחזיק את הראשון היה מגיע לשני.
   */
  it('⭐ שינוי תו אחד בקוד משנה את כל שלושת הערכים', async () => {
    const a = await deriveIdentity('ABCD2345EFGH6789');
    const b = await deriveIdentity('ABCD2345EFGH678A');

    expect(a.email).not.toBe(b.email);
    expect(a.password).not.toBe(b.password);
    expect(a.passphrase).not.toBe(b.passphrase);
  });
});
