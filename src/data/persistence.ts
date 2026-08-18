/**
 * לבקש מהדפדפן לא למחוק את הנתונים.
 *
 * ⚠️ **זה הפער שגרם ל"הכל נעלם לי".**
 *
 * IndexedDB הוא ברירת מחדל אחסון *זמני*. הדפדפן רשאי למחוק אותו
 * כשנגמר מקום, כשהאתר לא נפתח זמן מה, או בניקוי אוטומטי — בלי
 * להתריע ובלי דרך לשחזר. עבור אפליקציית פתקים זה מעצבן; עבור
 * חודשי היסטוריה פיננסית זה אובדן מוחלט.
 *
 * `navigator.storage.persist()` מבקש להפוך את האחסון לקבוע. מאותו
 * רגע הדפדפן לא ימחק אותו מיוזמתו — רק המשתמש יכול.
 *
 * ⚠️ הבקשה אינה ערובה. דפדפנים מחליטים לפי היוריסטיקה (התקנה למסך
 * הבית, ביקורים חוזרים, סימנייה). לכן היא **בנוסף** לגיבוי ולסנכרון
 * ולא במקומם — וסטטוס האחסון מוצג למשתמש כדי שידע איפה הוא עומד.
 */

export type StorageStatus =
  /** הדפדפן התחייב לא למחוק. */
  | 'persistent'
  /** האחסון זמני — הדפדפן עלול למחוק. */
  | 'best_effort'
  /** הדפדפן לא תומך בממשק. */
  | 'unsupported';

function supported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage?.persist === 'function' &&
    typeof navigator.storage?.persisted === 'function'
  );
}

/**
 * מבקש אחסון קבוע, פעם אחת, אם עוד אין.
 *
 * ⚠️ בטוח לקרוא בכל עלייה: כשהאחסון כבר קבוע לא נשלחת בקשה נוספת,
 * ובדפדפן שלא תומך הפונקציה פשוט מחזירה `unsupported` ולא זורקת.
 */
export async function ensurePersistentStorage(): Promise<StorageStatus> {
  if (!supported()) return 'unsupported';

  try {
    if (await navigator.storage.persisted()) return 'persistent';
    return (await navigator.storage.persist()) ? 'persistent' : 'best_effort';
  } catch {
    // ⚠️ בשקט ובלי לשבור את העלייה. כישלון כאן אומר שהאחסון פחות
    // בטוח, לא שהאפליקציה לא יכולה לרוץ.
    return 'unsupported';
  }
}

/** קורא את הסטטוס בלי לבקש דבר — לתצוגה בהגדרות. */
export async function readStorageStatus(): Promise<StorageStatus> {
  if (!supported()) return 'unsupported';
  try {
    return (await navigator.storage.persisted()) ? 'persistent' : 'best_effort';
  } catch {
    return 'unsupported';
  }
}

export interface StorageUsage {
  usedBytes: number | null;
  quotaBytes: number | null;
}

export async function readStorageUsage(): Promise<StorageUsage> {
  if (typeof navigator === 'undefined' || typeof navigator.storage?.estimate !== 'function') {
    return { usedBytes: null, quotaBytes: null };
  }
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usedBytes: usage ?? null, quotaBytes: quota ?? null };
  } catch {
    return { usedBytes: null, quotaBytes: null };
  }
}
