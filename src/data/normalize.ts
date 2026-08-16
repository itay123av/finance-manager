/**
 * נירמול שם בית עסק.
 *
 * מטרה: ש"ארומה סניף 41" ו-"ארומה   סניף 41 " ייחשבו לאותו בית עסק,
 * כדי שזיהוי הוצאות חוזרות וזיכרון הסיווג יעבדו.
 *
 * הניקוי מהתווים הבלתי-נראים נעשה ב-`import/encoding.ts`, שם הוא שייך —
 * הם מגיעים מהקובץ, לא מהמשתמש. כאן נשאר הנירמול הטקסטואלי בלבד.
 */

import { stripInvisibles } from '../import/encoding';

export function normalizeMerchant(merchant: string): string {
  return stripInvisibles(merchant)
    .trim()
    .toLowerCase()
    .replace(/["'`״׳]/g, '')
    .replace(/\s+/g, ' ');
}
