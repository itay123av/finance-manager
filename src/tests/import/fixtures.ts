/**
 * קובצי בדיקה מזויפים.
 *
 * ⚠️ כל הנתונים כאן פיקטיביים לחלוטין. הם מחקים **מבנים** של ייצוא
 * מבנקים ישראליים — כותרות בעברית, חובה/זכות נפרדות, מינוס בסוף,
 * טבלת HTML שמתחזה ל-Excel — ולא נתונים אמיתיים של אף אחד.
 */

import type { SourceFile } from '../../import/types';

export function textFile(name: string, content: string): SourceFile {
  return { name, bytes: new TextEncoder().encode(content) };
}

/** מקודד ל-windows-1255 — לבדיקת זיהוי הקידוד. */
export function hebrewCp1255File(name: string, content: string): SourceFile {
  const bytes = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    // אותיות עבריות: 0x05D0–0x05EA ממופות ל-0xE0–0xFA
    bytes[i] = code >= 0x05d0 && code <= 0x05ea ? code - 0x05d0 + 0xe0 : code;
  }
  return { name, bytes };
}

/** הפורמט הנפוץ: עמודת סכום אחת עם סימן. */
export const SIMPLE_CSV = `תאריך,תיאור,סכום,יתרה
05/08/2026,ארומה תל אביב,-64.00,1176.00
04/08/2026,רמי לוי,-152.50,1240.00
01/08/2026,העברת שכר,2400.00,1392.50
`;

/** חובה וזכות בשתי עמודות — המקרה שמפיל מימושים נאיביים. */
export const DEBIT_CREDIT_CSV = `תאריך ערך,שם בית העסק,חובה,זכות,יתרה
05/08/2026,ארומה,64.00,,1176.00
04/08/2026,סופרפארם,152.50,,1240.00
01/08/2026,העברת שכר,,2400.00,1392.50
`;

/** מינוס בסוף המספר — מוסכמה של מערכות בנקאיות ותיקות. */
export const TRAILING_MINUS_CSV = `תאריך,פרטים,סכום
05/08/2026,ארומה,64.00-
01/08/2026,משכורת,2400.00
`;

/** שורות כותרת ולוגו לפני הנתונים, כמו בייצוא אמיתי. */
export const PREAMBLE_CSV = `דוח תנועות בחשבון
הופק בתאריך 07/08/2026
,,,
תאריך,תיאור,סכום
05/08/2026,ארומה,-64.00
04/08/2026,רב קו,-30.00
`;

/** בלי שורת כותרת בכלל — הזיהוי חייב לנחש מהתוכן. */
export const HEADERLESS_CSV = `05/08/2026,ארומה תל אביב,-64.00
04/08/2026,רמי לוי סניף מרכז,-152.50
01/08/2026,העברת שכר מהעסק,2400.00
`;

/** נקודה-פסיק כמפריד — נפוץ בייצוא מ-Excel בהגדרות עברית. */
export const SEMICOLON_CSV = `תאריך;תיאור;סכום
05/08/2026;ארומה;-64.00
04/08/2026;פיצה האט;-89.90
`;

/** שורות פגומות לצד תקינות — בודק שדיווח השגיאות מדויק. */
export const MESSY_CSV = `תאריך,תיאור,סכום
05/08/2026,ארומה,-64.00
לא תאריך,משהו,-20.00
06/08/2026,בלי סכום,
31/02/2026,תאריך שלא קיים,-10.00
07/08/2026,סכום אפס,0
08/08/2026,סכום שבור,abc
09/08/2026,תקין,-15.50
`;

/** "‎.xls" שהוא בעצם HTML — מלכודת קלאסית של אתרי בנקים. */
export const HTML_TABLE_XLS = `<html xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta http-equiv="Content-Type" content="text/html; charset=windows-1255"></head>
<body>
<table border="1">
<tr><td colspan="3">תנועות בחשבון</td></tr>
</table>
<table border="1">
<tr><th>תאריך</th><th>תיאור</th><th>חובה</th><th>זכות</th></tr>
<tr><td>05/08/2026</td><td>ארומה</td><td>64.00</td><td></td></tr>
<tr><td>01/08/2026</td><td>העברת שכר</td><td></td><td>2,400.00</td></tr>
</table>
</body></html>`;

/** תאריכים בפורמט אמריקאי — יום גדול מ-12 מסגיר אותם. */
export const US_DATE_CSV = `date,description,amount
08/05/2026,Aroma,-64.00
12/25/2026,Gift shop,-120.00
`;
