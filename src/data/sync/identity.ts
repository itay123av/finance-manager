/**
 * מקוד חיבור אחד → זהות חשבון **ו**מפתח הצפנה.
 *
 * ⚠️ **זה הקובץ שבו טעות מוסרת לשרת את המפתח לנתונים.**
 *
 * המשתמש מקליד דבר אחד. ממנו נגזרים שלושה ערכים:
 *
 * | ערך | לאן הוא הולך |
 * |---|---|
 * | `email` | לשרת — מזהה את השורה |
 * | `password` | לשרת — מאמת שזה אתה |
 * | `passphrase` | **נשאר במכשיר** — מפענח את הבלוב |
 *
 * ⚠️ **למה השרת לא יכול לפענח למרות שהוא מקבל שניים מהשלושה:**
 *
 * כל שלושת הערכים הם פונקציות חד־כיווניות **נפרדות** של הקוד:
 * `HMAC(masterKey, "auth")`, `HMAC(masterKey, "enc")` וכו'. השרת
 * מקבל את `auth` בלבד. כדי להגיע מ-`auth` ל-`enc` הוא היה צריך
 * להפוך את ה-HMAC ולשחזר את הקוד — וזה בדיוק מה ש-HMAC לא מאפשר.
 *
 * ⚠️ **מה כן היה שובר את זה:** לשלוח את הקוד עצמו כסיסמה. אז השרת
 * היה מחזיק את החומר שממנו נגזר גם מפתח ההצפנה, וכל ההצפנה הייתה
 * הופכת לקישוט. לכן הקוד הגולמי **לעולם** לא נשלח.
 */

import { normalizePairingCode } from '../../core/pairingCode';

/**
 * מלח קבוע לגזירת המפתח הראשי.
 *
 * ⚠️ מלח קבוע הוא בדרך כלל ריח רע — הוא מאפשר לחשב מראש טבלה אחת
 * שתוקפת את כל המשתמשים. כאן זה מקובל מסיבה אחת: הקוד עצמו נושא
 * 80 ביט של אקראיות אמיתית, ולכן אין "סיסמאות נפוצות" שכדאי לחשב
 * מראש. מלח לכל משתמש היה דורש להעביר אותו למכשיר השני — כלומר
 * להאריך את הקוד בלי להוסיף ביטחון ממשי.
 */
const MASTER_SALT = 'finance-manager/pairing/v1';

/**
 * מספר הסבבים לגזירת המפתח הראשי.
 *
 * ⚠️ רץ פעם אחת בלבד לכל מכשיר (בחיבור), ולא בכל סנכרון — שלושת
 * הערכים נגזרים ממנו ב-HMAC מהיר. לכן אפשר להרשות מספר גבוה בלי
 * לפגוע בחוויה, גם בטלפון.
 */
const MASTER_ITERATIONS = 300_000;

/** הדומיין לאימיילים המסונתזים. לא נשלח אליו דואר לעולם. */
const SYNTHETIC_DOMAIN = 'device.local';

export interface SyncIdentity {
  /** מזהה מסונתז. אינו כתובת דואר אמיתית ואינו ניתן ליצירת קשר. */
  email: string;
  /** סיסמת החשבון מול שירות ההתחברות. */
  password: string;
  /** מפתח ההצפנה. ⚠️ לעולם לא נשלח לשום מקום. */
  passphrase: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function deriveMasterKey(code: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(code),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode(MASTER_SALT) as BufferSource,
      iterations: MASTER_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    256,
  );
  return crypto.subtle.importKey('raw', bits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

/** הרחבה מהירה של המפתח הראשי לערך ייעודי אחד. */
async function expand(master: CryptoKey, purpose: string): Promise<Uint8Array> {
  const sig = await crypto.subtle.sign('HMAC', master, new TextEncoder().encode(purpose));
  return new Uint8Array(sig);
}

/**
 * גוזר את שלושת הערכים מקוד החיבור.
 *
 * ⚠️ דטרמיניסטי לחלוטין: אותו קוד במכשיר אחר ייתן בדיוק את אותה
 * זהות ואת אותו מפתח. זה מה שמאפשר לטלפון להגיע לאותם נתונים בלי
 * שום העברה נוספת מלבד הקוד.
 */
export async function deriveIdentity(rawCode: string): Promise<SyncIdentity> {
  const code = normalizePairingCode(rawCode);
  const master = await deriveMasterKey(code);

  const [emailBytes, authBytes, encBytes] = await Promise.all([
    expand(master, 'email'),
    expand(master, 'auth'),
    expand(master, 'encryption'),
  ]);

  return {
    email: `s${toHex(emailBytes).slice(0, 24)}@${SYNTHETIC_DOMAIN}`,
    // ⚠️ 32 בייט ב-base64url — ארוך ואקראי הרבה מעבר לכל דרישת
    // מינימום, ולכן אין כאן "סיסמה חלשה" בשום מובן.
    password: toBase64Url(authBytes),
    passphrase: toBase64Url(encBytes),
  };
}
