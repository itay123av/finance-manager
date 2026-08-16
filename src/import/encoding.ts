/**
 * פענוח קידוד.
 *
 * קובצי בנק ישראליים מגיעים לא פעם ב-windows-1255 ולא ב-UTF-8. אם
 * מפענחים לא נכון, שמות בתי העסק הופכים לג׳יבריש — והסיווג האוטומטי,
 * שנשען כולו על השם, מפסיק לעבוד. לכן זה הצעד הראשון בצנרת.
 *
 * הדפדפן יודע לפענח windows-1255 בעצמו, ולכן אין כאן ספרייה חיצונית.
 */

const BOM_UTF8 = [0xef, 0xbb, 0xbf];
const BOM_UTF16LE = [0xff, 0xfe];
const BOM_UTF16BE = [0xfe, 0xff];

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, i) => bytes[i] === byte);
}

export interface DecodedText {
  text: string;
  encoding: string;
}

/**
 * מפענח בייטים לטקסט.
 *
 * הסדר מכוון: BOM גובר על הכל, אחר כך UTF-8 קפדני, ורק אם הוא נכשל —
 * windows-1255. פענוח UTF-8 עם `fatal: true` הוא בדיקה אמינה: רצף
 * בייטים עברי ב-windows-1255 כמעט תמיד אינו UTF-8 תקין.
 */
export function decodeBytes(bytes: Uint8Array): DecodedText {
  if (startsWith(bytes, BOM_UTF8)) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8' };
  }
  if (startsWith(bytes, BOM_UTF16LE)) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' };
  }
  if (startsWith(bytes, BOM_UTF16BE)) {
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' };
  }

  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1255').decode(bytes), encoding: 'windows-1255' };
  }
}

/**
 * תווים בלתי-נראים שמגיעים מקובצי בנק: סימני כיווניות, רווחים מיוחדים
 * ומקפי אפס-רוחב. הם שוברים כל השוואת מחרוזות שנעשית אחריהם — שני
 * שמות שנראים זהים על המסך אינם שווים בקוד.
 *
 * הם כתובים כקודים ולא כתווים בכוונה: תו בלתי-נראה בתוך הקוד הוא
 * תקלה שמחכה לקרות — אי אפשר לראות אותו ואי אפשר לדעת שנמחק בטעות.
 */
const BIDI_MARKS = new RegExp(
  '[' +
    '‎‏' + // LRM, RLM
    '‪-‮' + // embedding / override
    '⁦-⁩' + // isolates
    '؜' + // arabic letter mark
    '​-‍' + // zero-width space / non-joiner / joiner
    '﻿' + // zero-width no-break space
    ']',
  'g',
);

/** רווחים שנראים רגילים אבל אינם שווים לרווח. */
const ODD_SPACES = new RegExp('[    - 　]', 'g');

export function stripInvisibles(value: string): string {
  return value.replace(BIDI_MARKS, '').replace(ODD_SPACES, ' ');
}
