/**
 * החלטת הסנכרון.
 *
 * ⚠️ הבדיקות כאן שומרות על הדבר היחיד שסנכרון יכול להרוס: נתונים.
 * במיוחד המקרה שבו טלפון שהיה סגור שבוע נפתח ומסנכרן — הוא לא אמור
 * למחוק את מה שהוזן במחשב באותו בוקר.
 */

import { describe, expect, it } from 'vitest';
import { decideSync, isSafeToAutoSync, type SyncState } from '../../core/syncDecision';

const state = (overrides: Partial<SyncState> = {}): SyncState => ({
  hasLocalData: false,
  localChanged: false,
  remoteUpdatedAt: null,
  lastSyncedRemoteAt: null,
  ...overrides,
});

describe('מצבי פתיחה', () => {
  it('אין כלום בשום צד', () => {
    expect(decideSync(state()).action).toBe('nothing');
  });

  it('⭐ מכשיר חדש עם ענן קיים — מושכים, אין מה לאבד', () => {
    const decision = decideSync(state({ remoteUpdatedAt: '2026-08-10T10:00:00Z' }));
    expect(decision.action).toBe('pull_initial');
    expect(decision.automatic).toBe(true);
  });

  it('ענן ריק עם נתונים מקומיים — העלאה ראשונה', () => {
    const decision = decideSync(state({ hasLocalData: true, localChanged: true }));
    expect(decision.action).toBe('push_initial');
    expect(decision.automatic).toBe(true);
  });
});

describe('אחרי סנכרון קודם', () => {
  const synced = '2026-08-10T10:00:00Z';
  const after = (overrides: Partial<SyncState> = {}): SyncState =>
    state({
      hasLocalData: true,
      remoteUpdatedAt: synced,
      lastSyncedRemoteAt: synced,
      ...overrides,
    });

  it('שני הצדדים לא זזו', () => {
    const decision = decideSync(after());
    expect(decision.action).toBe('in_sync');
    expect(isSafeToAutoSync(decision)).toBe(false);
  });

  it('רק המכשיר זז → העלאה', () => {
    const decision = decideSync(after({ localChanged: true }));
    expect(decision.action).toBe('push');
    expect(isSafeToAutoSync(decision)).toBe(true);
  });

  it('רק הענן זז → משיכה', () => {
    const decision = decideSync(after({ remoteUpdatedAt: '2026-08-11T09:00:00Z' }));
    expect(decision.action).toBe('pull');
    expect(isSafeToAutoSync(decision)).toBe(true);
  });

  /**
   * ⭐ התרחיש שבגללו כל הקובץ הזה קיים.
   *
   * הטלפון היה סגור שבוע. בינתיים הוזנו עסקאות במחשב (הענן זז),
   * וגם בטלפון עצמו נשארה הזנה מקומית. "המאוחר מנצח" היה מוחק אחד
   * מהם בשקט.
   */
  it('⭐ שני הצדדים זזו → התנגשות, בלי דריסה אוטומטית', () => {
    const decision = decideSync(
      after({ localChanged: true, remoteUpdatedAt: '2026-08-11T09:00:00Z' }),
    );
    expect(decision.action).toBe('conflict');
    expect(decision.automatic).toBe(false);
    expect(isSafeToAutoSync(decision)).toBe(false);
  });

  /**
   * ⭐ הבאג שבדיקת שני המכשירים חשפה.
   *
   * כשהמכשיר דיווח על "מתי השתניתי" בשעון שלו, מול חותמת שמגיעה
   * משעון השרת, טלפון שהשעון שלו מפגר בדקה קיבל 'pull' במקום
   * 'conflict' — כלומר משיכה שמוחקת את מה שהרגע הוזן.
   *
   * עכשיו אין השוואת שעונים בכלל: `localChanged` הוא בוליאני,
   * ולכן אין חותמת זמן מקומית שיכולה "לפגר".
   */
  it('⭐ שינוי מקומי גובר גם כשחותמת הענן מאוחרת ממנו', () => {
    const decision = decideSync(
      after({
        localChanged: true,
        // הענן קדימה בהרבה — בדיוק המצב שבו שעון מפגר היה מזיק.
        remoteUpdatedAt: '2027-01-01T00:00:00Z',
      }),
    );
    expect(decision.action).toBe('conflict');
  });

  it('⭐ שינוי מקומי מזוהה גם כשהענן לא זז כלל', () => {
    // בלי שעון: העובדה שהתוכן שונה מספיקה.
    const decision = decideSync(after({ localChanged: true }));
    expect(decision.action).toBe('push');
  });
});

describe('בלי נקודת ייחוס', () => {
  /**
   * ⭐ אין `lastSyncedRemoteAt` אבל יש נתונים בשני הצדדים — למשל
   * מכשיר שהתקין מחדש. אי אפשר לדעת מה נגזר ממה, ולכן זו התנגשות
   * ולא "משיכה כי הענן מאוחר".
   */
  it('⭐ נתונים בשני הצדדים בלי היסטוריית סנכרון → התנגשות', () => {
    const decision = decideSync(
      state({
        hasLocalData: true,
        localChanged: false,
        remoteUpdatedAt: '2026-08-11T09:00:00Z',
      }),
    );
    expect(decision.action).toBe('conflict');
    expect(decision.automatic).toBe(false);
  });
});

describe('לכל החלטה יש נימוק בעברית', () => {
  it('הנימוק אינו ריק ואינו טכני', () => {
    const cases: SyncState[] = [
      state(),
      state({ remoteUpdatedAt: '2026-08-10T10:00:00Z' }),
      state({ hasLocalData: true, localChanged: true }),
      state({
        hasLocalData: true,
        localChanged: true,
        remoteUpdatedAt: '2026-08-11T09:00:00Z',
        lastSyncedRemoteAt: '2026-08-10T10:00:00Z',
      }),
    ];
    for (const c of cases) {
      const { reasonHe } = decideSync(c);
      expect(reasonHe.length).toBeGreaterThan(10);
      expect(reasonHe).not.toMatch(/null|undefined|Error/);
    }
  });
});
