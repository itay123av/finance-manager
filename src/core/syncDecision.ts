/**
 * מי מנצח: המכשיר או הענן.
 *
 * ⚠️ **זה הקובץ שבו טעות עולה בנתונים.** כל שאר הסנכרון הוא צנרת —
 * הצפנה, רשת, כפתורים. כאן מחליטים אם לדרוס עסקאות, ודריסה שגויה
 * אחת מוחקת חודשי היסטוריה בלי דרך חזרה.
 *
 * לכן ההיגיון יושב ב-`core/`: פונקציה טהורה, בלי רשת ובלי שעון,
 * שאפשר לבדוק על כל צירוף מצבים.
 *
 * ⚠️ **הכלל המרכזי: מעולם לא דורסים בשקט.**
 *
 * "המאוחר מנצח" נשמע הגיוני עד הפעם הראשונה שבו הטלפון, שהיה סגור
 * שבוע, מסנכרן ומוחק את מה שהוזן במחשב באותו בוקר. לכן כשגם המכשיר
 * וגם הענן השתנו מאז הסנכרון האחרון — התוצאה היא `conflict`, והמשתמש
 * מכריע. הוא היחיד שיודע איזה צד נכון.
 */

/** מה צריך לקרות עכשיו. */
export type SyncAction =
  /** שני הצדדים זהים — אין מה לעשות. */
  | 'in_sync'
  /** רק המכשיר השתנה → להעלות. */
  | 'push'
  /** רק הענן השתנה → להוריד. */
  | 'pull'
  /** מכשיר חדש, יש ענן בלבד → להוריד הכל. */
  | 'pull_initial'
  /** ענן ריק, יש נתונים מקומיים → העלאה ראשונה. */
  | 'push_initial'
  /** שני הצדדים השתנו → המשתמש מכריע. */
  | 'conflict'
  /** אין כלום בשום צד. */
  | 'nothing';

export interface SyncState {
  /** האם יש בכלל נתונים במכשיר. */
  hasLocalData: boolean;
  /**
   * האם הנתונים המקומיים השתנו מאז הסנכרון האחרון.
   *
   * ⚠️ **בוליאני ולא חותמת זמן, וזו הגנה מפני אובדן נתונים.**
   *
   * הניסוח המתבקש הוא `localChangedAt` והשוואה מול `lastSyncedRemoteAt`.
   * הבעיה: `lastSyncedRemoteAt` מגיע משעון **השרת**, ו-`localChangedAt`
   * משעון **המכשיר**. טלפון שהשעון שלו מפגר בדקה היה מדווח "לא
   * השתנה כלום" מיד אחרי הזנת עסקה — והמערכת הייתה מושכת מהענן
   * ומוחקת אותה.
   *
   * המכשיר יודע רק אם התוכן שלו זהה לזה שסונכרן. זה בדיוק מה
   * שהשדה הזה אומר, ואין בו שעון.
   */
  localChanged: boolean;
  /** חותמת הזמן של הבלוב בענן. `null` = אין כלום בענן. */
  remoteUpdatedAt: string | null;
  /**
   * חותמת הענן שנקלטה בסנכרון המוצלח האחרון **במכשיר הזה**.
   *
   * ⚠️ זו נקודת הייחוס היחידה שמאפשרת להבחין בין "הענן חדש ממני"
   * לבין "הענן השתנה מאחורי הגב שלי". בלעדיה כל הפרש נראה כמו
   * התנגשות, או גרוע מכך — כמו לא-התנגשות.
   *
   * ⚠️ מושווה רק מול `remoteUpdatedAt`, כלומר שני ערכים מאותו שעון
   * שרת. אין כאן השוואה בין שעונים שונים.
   */
  lastSyncedRemoteAt: string | null;
}

export interface SyncDecision {
  action: SyncAction;
  /** האם הפעולה בטוחה לביצוע אוטומטי בלי לשאול. */
  automatic: boolean;
  reasonHe: string;
}

export function decideSync(state: SyncState): SyncDecision {
  const { hasLocalData, localChanged, remoteUpdatedAt, lastSyncedRemoteAt } = state;

  if (!hasLocalData && remoteUpdatedAt === null) {
    return { action: 'nothing', automatic: true, reasonHe: 'אין נתונים בשום צד.' };
  }

  // מכשיר חדש: יש ענן, אין מקומי. אין מה לאבד — מושכים.
  if (!hasLocalData) {
    return {
      action: 'pull_initial',
      automatic: true,
      reasonHe: 'יש נתונים בענן ואין כלום במכשיר הזה.',
    };
  }

  // ענן ריק: העלאה ראשונה. גם כאן אין מה לאבד.
  if (remoteUpdatedAt === null) {
    return {
      action: 'push_initial',
      automatic: true,
      reasonHe: 'עוד לא הועלה שום דבר לענן.',
    };
  }

  // ⚠️ הענן זז מאז הסנכרון האחרון שלנו = מכשיר אחר כתב.
  // שני הערכים מגיעים משעון השרת, ולכן ההשוואה תקפה.
  const remoteMoved = lastSyncedRemoteAt === null || remoteUpdatedAt > lastSyncedRemoteAt;

  // ⚠️ בלי נקודת ייחוס אי אפשר לדעת מה נגזר ממה. מכשיר שיש בו
  // נתונים ומעולם לא סונכרן נחשב כמי שזז — אחרת הוא היה נמשך
  // ונדרס בשקט.
  const localMoved = lastSyncedRemoteAt === null || localChanged;

  if (!remoteMoved && !localMoved) {
    return { action: 'in_sync', automatic: true, reasonHe: 'שני הצדדים מעודכנים.' };
  }

  if (remoteMoved && !localMoved) {
    return {
      action: 'pull',
      automatic: true,
      reasonHe: 'מכשיר אחר עדכן את הענן, וכאן לא השתנה כלום.',
    };
  }

  if (!remoteMoved && localMoved) {
    return {
      action: 'push',
      automatic: true,
      reasonHe: 'השתנו נתונים במכשיר הזה בלבד.',
    };
  }

  // ⚠️ שניהם זזו. אין דרך לדעת מה נכון בלי לשאול, ואין מיזוג —
  // הבלוב מוצפן וחסר מבנה מבחוץ.
  return {
    action: 'conflict',
    automatic: false,
    reasonHe: 'גם המכשיר וגם הענן השתנו מאז הסנכרון האחרון. צריך לבחור איזה צד לשמור.',
  };
}

/**
 * האם מותר לבצע את ההחלטה בלי לשאול את המשתמש.
 *
 * מופרד מ-`decideSync` כדי שקריאה במסך תישאר קריאה: "אם אפשר
 * אוטומטית — עשה; אחרת הצג".
 */
export function isSafeToAutoSync(decision: SyncDecision): boolean {
  return decision.automatic && decision.action !== 'nothing' && decision.action !== 'in_sync';
}
