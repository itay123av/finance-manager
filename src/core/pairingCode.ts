/**
 * קוד החיבור — הדבר היחיד שהמשתמש מקליד בכל המערכת.
 *
 * ⚠️ הקוד הזה **הוא** המפתח לנתונים. מי שמחזיק אותו יכול להתחבר
 * לחשבון ולפענח את הבלוב. לכן שני דברים חשובים כאן:
 *
 * 1. **מספיק אקראיות כדי שאי אפשר יהיה לנחש.** 16 תווים מאלפבית
 *    של 32 = 80 ביט. ניחוש שיטתי אינו מעשי גם עם משאבים גדולים.
 * 2. **מספיק קריא כדי להעתיק אותו נכון מהמסך לטלפון.** אלפבית ללא
 *    התווים שמתבלבלים — אין `I`, אין `L`, אין `O`, אין `U`.
 *
 * ⚠️ הקובץ הזה טהור: הוא לא מגריל בעצמו ולא נוגע ב-crypto. האקראיות
 * מוזרקת מבחוץ, וכך אפשר לבדוק כל מקרה קצה בלי הפתעות.
 */

/**
 * אלפבית Crockford Base32.
 *
 * ⚠️ חסרים בכוונה `I`, `L`, `O`, `U`:
 * - `I`/`L` מתבלבלים עם `1`
 * - `O` מתבלבל עם `0`
 * - `U` הוצא כדי למנוע מילים גסות אקראיות
 */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** אורך הקוד בתווים. 16 × 5 ביט = 80 ביט אנטרופיה. */
export const CODE_LENGTH = 16;

/** גודל הקבוצה בתצוגה: `XXXX-XXXX-XXXX-XXXX`. */
const GROUP_SIZE = 4;

/**
 * בונה קוד מתוך בייטים אקראיים.
 *
 * ⚠️ דורש לפחות `CODE_LENGTH` בייטים. כל בייט ממופה לתו אחד
 * באמצעות חמשת הביטים התחתונים — מיפוי אחיד, בלי הטיה מודולו.
 */
export function generatePairingCode(randomBytes: Uint8Array): string {
  if (randomBytes.length < CODE_LENGTH) {
    throw new Error('אין מספיק אקראיות ליצירת קוד חיבור');
  }
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    // ⚠️ 5 ביט תחתונים בדיוק: 32 ערכים אפשריים מול אלפבית של 32,
    // ולכן כל תו סביר באותה מידה. `% 32` על בייט היה נותן משקל
    // עודף לתווים הראשונים.
    out += CODE_ALPHABET[randomBytes[i]! & 0b11111];
  }
  return out;
}

/**
 * מנקה קלט של משתמש לצורת השוואה.
 *
 * ⚠️ מתקן את טעויות ההעתקה הנפוצות במקום להיכשל עליהן. מי שמעתיק
 * קוד מהמסך של המחשב לטלפון יקליד `O` במקום `0` — ולהחזיר לו
 * "קוד שגוי" על זה זו חוויה גרועה בלי שום רווח באבטחה.
 */
export function normalizePairingCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V');
}

export function isValidPairingCode(input: string): boolean {
  const normalized = normalizePairingCode(input);
  if (normalized.length !== CODE_LENGTH) return false;
  return [...normalized].every((c) => CODE_ALPHABET.includes(c));
}

/** מוסיף מקפים לקריאה. תצוגה בלבד — הגזירה משתמשת בצורה המנוקה. */
export function formatPairingCode(code: string): string {
  const normalized = normalizePairingCode(code);
  const groups: string[] = [];
  for (let i = 0; i < normalized.length; i += GROUP_SIZE) {
    groups.push(normalized.slice(i, i + GROUP_SIZE));
  }
  return groups.join('-');
}
