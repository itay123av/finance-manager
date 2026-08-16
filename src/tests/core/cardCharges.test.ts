/**
 * ⭐ בדיקות קישור עסקאות כרטיס לחיובי הבנק.
 *
 * הקישור הוא מה שמאפשר לדעת אילו שתי רשומות מתארות את אותו כסף.
 * קישור שגוי משייך הוצאה לחיוב הלא נכון; היעדר קישור משאיר את
 * ההוצאה ללא פירוט. שניהם עדיפים על ניחוש.
 */

import { describe, expect, it } from 'vitest';
import {
  CHARGE_WINDOW_DAYS,
  autoLinkable,
  matchCardTransactionsToCharges,
  reconcileCardCycle,
} from '../../core/cardCharges';
import type { CardTransaction } from '../../core/types';
import { ILS, tx } from '../helpers';

const CARDS = [
  { id: 'card-3483', last4: '3483' },
  { id: 'card-4569', last4: '4569' },
];

function cardTx(
  overrides: Partial<CardTransaction> & { id: string; shekels: number },
): CardTransaction {
  const { shekels, ...rest } = overrides;
  return {
    cardId: 'card-3483',
    purchaseDate: '2026-07-26',
    merchant: 'חנות',
    merchantNormalized: 'חנות',
    amountAgorot: ILS(shekels),
    currency: 'ILS',
    categoryId: 'cat-other',
    isRefund: false,
    status: 'billed',
    sourceFile: 'card.xlsx',
    classificationConfidence: 0.8,
    userCorrected: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...rest,
  } as CardTransaction;
}

const chargeOf = (id: string, date: string, shekels: number, last4 = '3483') =>
  tx({ id, date, shekels, merchant: `חיוב לכרטיס ויזה ${last4}` });

describe('התאמה של עסקה בודדת', () => {
  it('⭐ סכום זהה בטווח תאריכים סביר → ביטחון גבוה', () => {
    const matches = matchCardTransactionsToCharges({
      bankTransactions: [chargeOf('b1', '2026-07-28', 45)],
      cardTransactions: [cardTx({ id: 'c1', shekels: 45, purchaseDate: '2026-07-26' })],
      cards: CARDS,
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      confidence: 'high',
      cardTransactionIds: ['c1'],
      differenceAgorot: 0,
    });
  });

  it('פער תאריכים גדול מדי → אין התאמה', () => {
    const matches = matchCardTransactionsToCharges({
      bankTransactions: [chargeOf('b1', '2026-07-28', 45)],
      cardTransactions: [cardTx({ id: 'c1', shekels: 45, purchaseDate: '2026-07-01' })],
      cards: CARDS,
    });
    expect(matches[0]?.confidence).toBe('unresolved');
    expect(matches[0]?.reasonHe).toContain('טווח התאריכים');
  });

  it('רכישה אחרי החיוב אינה מועמדת', () => {
    const matches = matchCardTransactionsToCharges({
      bankTransactions: [chargeOf('b1', '2026-07-20', 45)],
      cardTransactions: [cardTx({ id: 'c1', shekels: 45, purchaseDate: '2026-07-25' })],
      cards: CARDS,
    });
    expect(matches[0]?.confidence).toBe('unresolved');
  });

  it('סכום שאינו תואם → אין התאמה', () => {
    const matches = matchCardTransactionsToCharges({
      bankTransactions: [chargeOf('b1', '2026-07-28', 45)],
      cardTransactions: [cardTx({ id: 'c1', shekels: 44, purchaseDate: '2026-07-26' })],
      cards: CARDS,
    });
    expect(matches[0]?.confidence).toBe('unresolved');
    expect(matches[0]?.reasonHe).toContain('מסתכמת בדיוק');
  });
});

describe('⭐ אצווה: כמה עסקאות לחיוב אחד', () => {
  it('שתי עסקאות מאותו יום מסתכמות לחיוב אחד', () => {
    const matches = matchCardTransactionsToCharges({
      bankTransactions: [chargeOf('b1', '2026-06-18', 70)],
      cardTransactions: [
        cardTx({ id: 'c1', shekels: 30, purchaseDate: '2026-06-17' }),
        cardTx({ id: 'c2', shekels: 40, purchaseDate: '2026-06-17' }),
      ],
      cards: CARDS,
    });

    expect(matches[0]?.confidence).toBe('high');
    expect(matches[0]?.cardTransactionIds.sort()).toEqual(['c1', 'c2']);
  });

  it('ארבע עסקאות — כולל סכומים חוזרים', () => {
    const matches = matchCardTransactionsToCharges({
      bankTransactions: [chargeOf('b1', '2026-06-25', 35.8)],
      cardTransactions: [
        cardTx({ id: 'c1', shekels: 11.9, purchaseDate: '2026-06-23' }),
        cardTx({ id: 'c2', shekels: 6, purchaseDate: '2026-06-23' }),
        cardTx({ id: 'c3', shekels: 11.9, purchaseDate: '2026-06-23' }),
        cardTx({ id: 'c4', shekels: 6, purchaseDate: '2026-06-23' }),
      ],
      cards: CARDS,
    });

    expect(matches[0]?.confidence).toBe('high');
    expect(matches[0]?.cardTransactionIds).toHaveLength(4);
  });

  it('אצווה שמשתרעת על יומיים', () => {
    const matches = matchCardTransactionsToCharges({
      bankTransactions: [chargeOf('b1', '2026-07-28', 143.52)],
      cardTransactions: [
        cardTx({ id: 'c1', shekels: 74.9, purchaseDate: '2026-07-25' }),
        cardTx({ id: 'c2', shekels: 6, purchaseDate: '2026-07-26' }),
        cardTx({ id: 'c3', shekels: 62.62, purchaseDate: '2026-07-26' }),
      ],
      cards: CARDS,
    });
    expect(matches[0]?.confidence).toBe('high');
    expect(matches[0]?.cardTransactionIds).toHaveLength(3);
  });
});

describe('⭐ ריבוי כרטיסים', () => {
  it('חיוב משויך רק לעסקאות של אותו כרטיס', () => {
    const matches = matchCardTransactionsToCharges({
      bankTransactions: [chargeOf('b1', '2026-07-28', 50, '4569')],
      cardTransactions: [
        cardTx({ id: 'c1', shekels: 50, cardId: 'card-3483', purchaseDate: '2026-07-26' }),
      ],
      cards: CARDS,
    });
    // הסכום תואם, אבל הכרטיס לא — ולכן אין קישור
    expect(matches[0]?.confidence).toBe('unresolved');
  });

  it('כל כרטיס מקבל את העסקאות שלו', () => {
    const matches = matchCardTransactionsToCharges({
      bankTransactions: [
        chargeOf('b1', '2026-07-28', 50, '3483'),
        chargeOf('b2', '2026-07-28', 80, '4569'),
      ],
      cardTransactions: [
        cardTx({ id: 'c1', shekels: 50, cardId: 'card-3483', purchaseDate: '2026-07-26' }),
        cardTx({ id: 'c2', shekels: 80, cardId: 'card-4569', purchaseDate: '2026-07-26' }),
      ],
      cards: CARDS,
    });
    expect(matches[0]?.cardTransactionIds).toEqual(['c1']);
    expect(matches[1]?.cardTransactionIds).toEqual(['c2']);
  });

  it('עסקה לא משמשת לשני חיובים', () => {
    const matches = matchCardTransactionsToCharges({
      bankTransactions: [chargeOf('b1', '2026-07-27', 50), chargeOf('b2', '2026-07-28', 50)],
      cardTransactions: [cardTx({ id: 'c1', shekels: 50, purchaseDate: '2026-07-26' })],
      cards: CARDS,
    });
    expect(matches[0]?.cardTransactionIds).toEqual(['c1']);
    expect(matches[1]?.cardTransactionIds).toEqual([]);
  });
});

describe('⭐ מצב לא חד-משמעי — לא מקשרים לבד', () => {
  it('שני צירופים שונים לאותו סכום → low, בלי קישור', () => {
    const matches = matchCardTransactionsToCharges({
      bankTransactions: [chargeOf('b1', '2026-07-28', 50)],
      cardTransactions: [
        cardTx({ id: 'c1', shekels: 50, purchaseDate: '2026-07-26' }),
        cardTx({ id: 'c2', shekels: 20, purchaseDate: '2026-07-26' }),
        cardTx({ id: 'c3', shekels: 30, purchaseDate: '2026-07-26' }),
      ],
      cards: CARDS,
    });

    expect(matches[0]?.confidence).toBe('low');
    expect(matches[0]?.cardTransactionIds).toEqual([]);
    expect(matches[0]?.alternatives.length).toBeGreaterThan(1);
    expect(matches[0]?.reasonHe).toContain('ידנית');
  });

  it('רק high ו-medium ניתנים לקישור אוטומטי', () => {
    const matches = matchCardTransactionsToCharges({
      bankTransactions: [chargeOf('b1', '2026-07-28', 50), chargeOf('b2', '2026-07-28', 999)],
      cardTransactions: [cardTx({ id: 'c1', shekels: 50, purchaseDate: '2026-07-26' })],
      cards: CARDS,
    });
    expect(autoLinkable(matches)).toHaveLength(1);
  });
});

describe('חיוב בלי מספר כרטיס', () => {
  it('⭐ חיוב בלי מספר כרטיס ובלי מועמדים — הסבר ייעודי', () => {
    const matches = matchCardTransactionsToCharges({
      bankTransactions: [
        tx({ id: 'b1', date: '2026-07-28', shekels: 45, merchant: 'חיוב זמני לכרטיס חיוב מיידי' }),
      ],
      cardTransactions: [],
      cards: CARDS,
    });
    expect(matches[0]?.confidence).toBe('unresolved');
    expect(matches[0]?.reasonHe).toContain('אין מספר כרטיס');
  });

  it('חיוב זמני מקבל ביטחון בינוני לכל היותר', () => {
    const matches = matchCardTransactionsToCharges({
      bankTransactions: [
        tx({ id: 'b1', date: '2026-07-28', shekels: 45, merchant: 'חיוב זמני לכרטיס חיוב מיידי' }),
      ],
      cardTransactions: [cardTx({ id: 'c1', shekels: 45, purchaseDate: '2026-07-26' })],
      cards: CARDS,
    });
    expect(matches[0]?.confidence).toBe('medium');
    expect(matches[0]?.last4).toBeNull();
  });
});

describe('עסקאות pending ומקרי קצה', () => {
  it('pending אינה מועמדת לקישור', () => {
    const matches = matchCardTransactionsToCharges({
      bankTransactions: [chargeOf('b1', '2026-07-28', 45)],
      cardTransactions: [
        cardTx({ id: 'c1', shekels: 45, purchaseDate: '2026-07-26', status: 'pending' }),
      ],
      cards: CARDS,
    });
    expect(matches[0]?.confidence).toBe('unresolved');
  });

  it('אין עסקאות כרטיס בכלל', () => {
    const matches = matchCardTransactionsToCharges({
      bankTransactions: [chargeOf('b1', '2026-07-28', 45)],
      cardTransactions: [],
      cards: CARDS,
    });
    expect(matches[0]?.confidence).toBe('unresolved');
  });

  it('אין חיובים בבנק', () => {
    expect(
      matchCardTransactionsToCharges({
        bankTransactions: [tx({ id: 'b1', date: '2026-07-28', shekels: 45, merchant: 'רמי לוי' })],
        cardTransactions: [cardTx({ id: 'c1', shekels: 45 })],
        cards: CARDS,
      }),
    ).toEqual([]);
  });

  it('חלון החיוב מוגדר בשישה ימים', () => {
    expect(CHARGE_WINDOW_DAYS).toBe(6);
  });
});

describe('התאמת מחזור', () => {
  it('הכל שויך — אין פער', () => {
    const cardTransactions = [
      cardTx({ id: 'c1', shekels: 30, purchaseDate: '2026-06-17' }),
      cardTx({ id: 'c2', shekels: 40, purchaseDate: '2026-06-17' }),
    ];
    const matches = matchCardTransactionsToCharges({
      bankTransactions: [chargeOf('b1', '2026-06-18', 70)],
      cardTransactions,
      cards: CARDS,
    });

    const result = reconcileCardCycle(cardTransactions, matches);
    expect(result.matches).toBe(true);
    expect(result.differenceAgorot).toBe(0);
    expect(result.unlinkedCardTransactions).toBe(0);
    expect(result.summaryHe).toContain('בלי פער');
  });

  it('עסקה שלא שויכה מדווחת', () => {
    const cardTransactions = [
      cardTx({ id: 'c1', shekels: 30, purchaseDate: '2026-06-17' }),
      cardTx({ id: 'c2', shekels: 99, purchaseDate: '2026-06-17' }),
    ];
    const matches = matchCardTransactionsToCharges({
      bankTransactions: [chargeOf('b1', '2026-06-18', 30)],
      cardTransactions,
      cards: CARDS,
    });

    const result = reconcileCardCycle(cardTransactions, matches);
    expect(result.matches).toBe(false);
    expect(result.unlinkedCardTransactions).toBe(1);
    expect(result.summaryHe).toContain('לא שויכו');
  });

  it('זיכוי מקטין את סכום המחזור', () => {
    const cardTransactions = [
      cardTx({ id: 'c1', shekels: 100, purchaseDate: '2026-06-17' }),
      cardTx({ id: 'c2', shekels: 30, purchaseDate: '2026-06-17', isRefund: true }),
    ];
    const result = reconcileCardCycle(cardTransactions, []);
    expect(result.cardTransactionsTotalAgorot).toBe(ILS(70));
  });

  it('⭐ פער בלי עסקאות תלויות — הודעה שמצביעה על אי-התאמה בסכומים', () => {
    // כל העסקאות שויכו, ובכל זאת הסכומים לא נפגשים: זה מצב אחר
    // לגמרי מ"נשארו עסקאות", והמשתמש צריך הסבר אחר
    const cardTransactions = [cardTx({ id: 'c1', shekels: 30, purchaseDate: '2026-06-17' })];
    const fakeMatches = [
      {
        bankTransactionId: 'b1',
        bankDate: '2026-06-18',
        bankAmountAgorot: ILS(50),
        last4: '3483',
        cardTransactionIds: ['c1'],
        matchedAmountAgorot: ILS(30),
        differenceAgorot: 0,
        confidence: 'medium' as const,
        reasonHe: '',
        alternatives: [],
      },
    ];

    const result = reconcileCardCycle(cardTransactions, fakeMatches);
    expect(result.matches).toBe(false);
    expect(result.unlinkedCardTransactions).toBe(0);
    expect(result.differenceAgorot).toBe(ILS(-20));
    expect(result.summaryHe).toContain('פער בין סכום עסקאות הכרטיס');
  });

  it('חיוב בלי פירוט נספר כלא מותאם', () => {
    const matches = matchCardTransactionsToCharges({
      bankTransactions: [chargeOf('b1', '2026-06-18', 70)],
      cardTransactions: [],
      cards: CARDS,
    });
    const result = reconcileCardCycle([], matches);
    expect(result.unmatchedCharges).toBe(1);
  });
});
