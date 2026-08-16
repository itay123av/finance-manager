/**
 * נעילת האפליקציה.
 *
 * ⚠️ קרא את זה לפני שמשנים כאן משהו:
 *
 * **מה זה כן.** מחסום מפני מבט מזדמן — מישהו שלוקח את הטלפון לרגע
 * לא רואה מיד יתרה, יעד ורשימת עסקאות.
 *
 * **מה זה לא.** זה **אינו** מצפין את IndexedDB. הנתונים יושבים באחסון
 * הדפדפן בדיוק כמו קודם, ומי שיודע לפתוח כלי פיתוח יקרא אותם בלי
 * לעבור כאן. להציג את זה כהצפנה היה שקר שמייצר ביטחון מדומה — ולכן
 * מסך הפרטיות אומר את זה במפורש.
 *
 * **הקוד עצמו לא נשמר.** נשמר `verifier` = PBKDF2(קוד, salt אקראי),
 * שהוא חד-כיווני. אין ולא יהיה מסלול "שחזור קוד" — איפוס הנעילה
 * מוחק את ה-verifier ומייצר חדש, והמשתמש מקבל הסבר מה זה אומר.
 */

import { appLockSchema } from './schema';
import type { AppLock } from '../core/types';

/**
 * פחות מ-PBKDF2 של הגיבוי (600k) ובכוונה.
 *
 * קוד בן 4–6 ספרות הוא מרחב של 10⁴–10⁶ — איטרציות לא מצילות אותו
 * מתקיפה offline, ומי שהגיע ל-IndexedDB ממילא לא צריך לנחש. מה
 * שכן נדרש: שהאימות ירגיש מיידי בטלפון ישן.
 */
export const LOCK_PBKDF2_ITERATIONS = 150_000;

export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 6;

/** 4–6 ספרות בדיוק. אין תווים אחרים — המקלדת בטלפון מספרית. */
export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${MIN_PIN_LENGTH},${MAX_PIN_LENGTH}}$`).test(pin);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveVerifier(
  pin: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    256,
  );
  return new Uint8Array(bits);
}

/** השוואה בזמן קבוע — לא כי התוקף כאן ריאלי, אלא כי אין סיבה לא. */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function createLock(pin: string, autoLockMinutes: number): Promise<AppLock> {
  if (!isValidPin(pin)) throw new Error('הקוד חייב להיות 4 עד 6 ספרות');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const verifier = await deriveVerifier(pin, salt, LOCK_PBKDF2_ITERATIONS);
  return appLockSchema.parse({
    verifier: toBase64(verifier),
    salt: toBase64(salt),
    iterations: LOCK_PBKDF2_ITERATIONS,
    autoLockMinutes,
  }) as AppLock;
}

export async function verifyPin(lock: AppLock, pin: string): Promise<boolean> {
  // קוד באורך לא חוקי נדחה בלי לגזור מפתח — אין מה לאמת.
  if (!isValidPin(pin)) return false;
  const derived = await deriveVerifier(pin, fromBase64(lock.salt), lock.iterations);
  return equalBytes(derived, fromBase64(lock.verifier));
}
