/**
 * רעיונות ההכנסה — אכיפת מה שהובטח.
 *
 * הרשימה מיועדת לבן 16 בישראל. הבדיקות כאן אינן בודקות "האם הרעיון
 * טוב" — זו לא שאלה שקוד יכול לענות עליה — אלא **שהרשימה לא זולגת**
 * למקומות שנאסרו: הימורים, מסחר, קריפטו, הלוואות, הבטחות רווח,
 * וסכמות שדורשות תשלום כדי להתחיל.
 *
 * הן גם אוכפות את הכלל שקל לשכוח: **טווח הכנסה בלי הצדקה הוא ניחוש
 * שמתחזה לנתון.** לכל טווח יש `basisHe`, או שאין טווח בכלל.
 */

import { describe, expect, it } from 'vitest';
import {
  INCOME_IDEAS,
  LEGAL_NOTE_HE,
  PARENT_APPROVAL_LABEL_HE,
  findIncomeIdea,
} from '../../content/incomeIdeas';

describe('מה אסור שיופיע', () => {
  const FORBIDDEN = [
    'הימור',
    'הימורים',
    'קזינו',
    'לוטו',
    'טוטו',
    'מסחר',
    'טריידינג',
    'מניות',
    'בורסה',
    'קריפטו',
    'ביטקוין',
    'מטבע דיגיטלי',
    'הלוואה',
    'הלוואות',
    'ריבית',
    'השקעה בשוק',
    'רווח מובטח',
    'הכנסה פסיבית מובטחת',
    'שיווק רשתי',
    'פירמידה',
  ];

  const text = JSON.stringify(INCOME_IDEAS) + LEGAL_NOTE_HE;

  it('⭐ אין הימורים, מסחר, קריפטו או הלוואות', () => {
    const found = FORBIDDEN.filter((word) => text.includes(word));
    expect(found).toEqual([]);
  });

  it('⭐ אין הבטחת רווח', () => {
    for (const idea of INCOME_IDEAS) {
      const body = `${idea.whatHe} ${idea.needToKnowHe} ${idea.prosHe.join(' ')}`;
      expect(body).not.toMatch(/מובטח|בטוח שתרוויח|רווח קל|בלי מאמץ/);
    }
  });

  it('⭐ הרשימה מזהירה מפני "עבודה" שדורשת תשלום מראש', () => {
    const warns = INCOME_IDEAS.some((idea) =>
      /תשלום מראש|דמי הרשמה|לשלם כדי להתחיל/.test(idea.needToKnowHe),
    );
    expect(warns || /לשלם כדי להתחיל/.test(text)).toBe(true);
  });
});

describe('שלמות הרעיונות', () => {
  it('יש לפחות עשרה רעיונות, עם מזהים ייחודיים', () => {
    expect(INCOME_IDEAS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(INCOME_IDEAS.map((i) => i.id)).size).toBe(INCOME_IDEAS.length);
  });

  it('לכל רעיון יש כל השדות שהובטחו', () => {
    for (const idea of INCOME_IDEAS) {
      expect(idea.titleHe.length, idea.id).toBeGreaterThan(2);
      expect(idea.whatHe.length, idea.id).toBeGreaterThan(20);
      expect(idea.needToKnowHe.length, idea.id).toBeGreaterThan(20);
      expect(idea.timeHe.length, idea.id).toBeGreaterThan(3);
      expect(idea.startupCostHe.length, idea.id).toBeGreaterThan(2);
      expect(PARENT_APPROVAL_LABEL_HE[idea.parentApproval], idea.id).toBeTruthy();
      expect(idea.prosHe.length, idea.id).toBeGreaterThanOrEqual(2);
      expect(idea.consHe.length, idea.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('⭐ לכל טווח הכנסה יש הצדקה — או שאין טווח', () => {
    for (const idea of INCOME_IDEAS) {
      if (idea.estimate === null) continue;
      expect(idea.estimate.basisHe.length, idea.id).toBeGreaterThan(30);
      expect(idea.estimate.unitHe.length, idea.id).toBeGreaterThan(2);
      expect(idea.estimate.lowAgorot, idea.id).toBeGreaterThan(0);
      expect(idea.estimate.highAgorot, idea.id).toBeGreaterThan(idea.estimate.lowAgorot);
    }
  });

  it('⭐ יש לפחות רעיון אחד בלי טווח — לא כל דבר ניתן לכימות', () => {
    // מכירת דברים אישיים היא סכום חד-פעמי. טווח "לשעה" עליה היה שקר.
    expect(INCOME_IDEAS.some((i) => i.estimate === null)).toBe(true);
  });

  it('⭐ עבודה מול מעסיק מסומנת כדורשת אישור הורה', () => {
    for (const id of ['summer-job', 'local-business', 'babysitting']) {
      expect(findIncomeIdea(id)?.parentApproval, id).toBe('required');
    }
  });

  it('החסרונות אמיתיים ולא מנוסחים כיתרונות', () => {
    for (const idea of INCOME_IDEAS) {
      for (const con of idea.consHe) {
        expect(con.length, `${idea.id}: ${con}`).toBeGreaterThan(10);
      }
    }
  });

  it('ההערה המשפטית מפנה לבדיקה עדכנית ולא מתיימרת להיות ייעוץ', () => {
    expect(LEGAL_NOTE_HE).toContain('כל זכות');
    expect(LEGAL_NOTE_HE).toMatch(/מגביל|בדוק|לבדוק/);
  });

  it('חיפוש לפי מזהה מחזיר את הרעיון, ו-undefined כשאין', () => {
    expect(findIncomeIdea('tutoring')?.titleHe).toBe('שיעורים פרטיים');
    expect(findIncomeIdea('nope')).toBeUndefined();
  });
});
