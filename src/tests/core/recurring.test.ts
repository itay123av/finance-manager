import { describe, expect, it } from 'vitest';
import {
  activeSubscriptions,
  detectRecurring,
  fixedMonthlyCommitments,
  MIN_OCCURRENCES,
  staleRecurring,
} from '../../core/recurring';
import { ILS, tx } from '../helpers';

const TODAY = '2026-08-07';

function spotify(months: readonly string[], shekels = 22) {
  return months.map((m) =>
    tx({ date: `${m}-12`, shekels, merchant: 'Spotify', merchantNormalized: 'spotify', categoryId: 'cat-phone' }),
  );
}

describe('זיהוי הוצאות חוזרות', () => {
  it('מזהה חיוב חודשי קבוע', () => {
    const found = detectRecurring(spotify(['2026-04', '2026-05', '2026-06', '2026-07']));
    expect(found).toHaveLength(1);
    expect(found[0]?.merchantNormalized).toBe('spotify');
    expect(found[0]?.amountAgorot).toBe(ILS(22));
    expect(found[0]?.yearlyAgorot).toBe(ILS(264));
    expect(found[0]?.occurrences).toBe(4);
  });

  it('דורש לפחות 3 מופעים — שניים יכולים להיות צירוף מקרים', () => {
    expect(MIN_OCCURRENCES).toBe(3);
    expect(detectRecurring(spotify(['2026-06', '2026-07']))).toHaveLength(0);
    expect(detectRecurring(spotify(['2026-05', '2026-06', '2026-07']))).toHaveLength(1);
  });

  it('סובל שינוי קל בסכום — מנויים מתייקרים לפעמים', () => {
    const transactions = [
      tx({ date: '2026-05-12', shekels: 22, merchantNormalized: 'spotify', merchant: 'Spotify' }),
      tx({ date: '2026-06-12', shekels: 23, merchantNormalized: 'spotify', merchant: 'Spotify' }),
      tx({ date: '2026-07-12', shekels: 22, merchantNormalized: 'spotify', merchant: 'Spotify' }),
    ];
    expect(detectRecurring(transactions)).toHaveLength(1);
  });

  it('לא מזהה סכומים שונים מהותית כמנוי', () => {
    const transactions = [
      tx({ date: '2026-05-12', shekels: 22, merchantNormalized: 'cafe', merchant: 'קפה' }),
      tx({ date: '2026-06-12', shekels: 95, merchantNormalized: 'cafe', merchant: 'קפה' }),
      tx({ date: '2026-07-12', shekels: 40, merchantNormalized: 'cafe', merchant: 'קפה' }),
    ];
    expect(detectRecurring(transactions)).toHaveLength(0);
  });

  it('לא מזהה רכישות באותו מקום במרווחים אקראיים', () => {
    const transactions = [
      tx({ date: '2026-07-01', shekels: 30, merchantNormalized: 'aroma', merchant: 'ארומה' }),
      tx({ date: '2026-07-04', shekels: 30, merchantNormalized: 'aroma', merchant: 'ארומה' }),
      tx({ date: '2026-07-09', shekels: 30, merchantNormalized: 'aroma', merchant: 'ארומה' }),
    ];
    expect(detectRecurring(transactions)).toHaveLength(0);
  });

  it('מתעלם מהכנסות, עסקאות pending ותיקוני התאמה', () => {
    expect(detectRecurring(spotify(['2026-05', '2026-06', '2026-07']).map((t) => ({ ...t, type: 'income' as const })))).toHaveLength(0);
    expect(detectRecurring(spotify(['2026-05', '2026-06', '2026-07']).map((t) => ({ ...t, status: 'pending' as const })))).toHaveLength(0);
    expect(detectRecurring(spotify(['2026-05', '2026-06', '2026-07']).map((t) => ({ ...t, kind: 'balance_adjustment' as const })))).toHaveLength(0);
  });

  it('מתעלם מעסקאות בלי שם מנורמל', () => {
    const transactions = spotify(['2026-05', '2026-06', '2026-07']).map((t) => ({
      ...t,
      merchantNormalized: '',
    }));
    expect(detectRecurring(transactions)).toHaveLength(0);
  });

  it('הביטחון עולה עם מספר החזרות', () => {
    const three = detectRecurring(spotify(['2026-05', '2026-06', '2026-07']))[0];
    const six = detectRecurring(spotify(['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']))[0];
    expect(six!.confidence).toBeGreaterThan(three!.confidence);
  });

  it('ממוין מהיקר לזול', () => {
    const found = detectRecurring([
      ...spotify(['2026-05', '2026-06', '2026-07'], 22),
      ...['2026-05', '2026-06', '2026-07'].map((m) =>
        tx({ date: `${m}-03`, shekels: 60, merchant: 'חדר כושר', merchantNormalized: 'gym' }),
      ),
    ]);
    expect(found.map((f) => f.merchantNormalized)).toEqual(['gym', 'spotify']);
  });
});

describe('מנויים פעילים מול מנויים שהפסיקו', () => {
  const active = spotify(['2026-05', '2026-06', '2026-07']);
  const stopped = spotify(['2026-01', '2026-02', '2026-03']);

  it('מנוי שחויב לאחרונה נחשב פעיל', () => {
    expect(activeSubscriptions(active, TODAY)).toHaveLength(1);
    expect(staleRecurring(active, TODAY)).toHaveLength(0);
  });

  it('מנוי שלא חויב מזה זמן מסומן כהפסיק', () => {
    expect(activeSubscriptions(stopped, TODAY)).toHaveLength(0);
    const stale = staleRecurring(stopped, TODAY);
    expect(stale).toHaveLength(1);
    expect(stale[0]?.messageHe).toContain('לשחרר');
  });

  it('ההודעה מציגה את העלות השנתית — שם ההבדל מורגש', () => {
    const notice = activeSubscriptions(active, TODAY)[0];
    expect(notice?.messageHe).toContain('₪264');
    expect(notice?.messageHe).toContain('בשנה');
  });

  it('ההודעה לא קובעת שהמנוי מיותר — היא שואלת', () => {
    const notice = activeSubscriptions(active, TODAY)[0];
    expect(notice?.messageHe).toContain('?');
    expect(notice?.messageHe).not.toMatch(/מיותר|בזבוז|תבטל/);
  });
});

describe('רצפת ההתחייבויות הקבועות', () => {
  it('מסכמת את כל המנויים הפעילים', () => {
    const transactions = [
      ...spotify(['2026-05', '2026-06', '2026-07'], 22),
      ...['2026-05', '2026-06', '2026-07'].map((m) =>
        tx({ date: `${m}-03`, shekels: 60, merchant: 'חדר כושר', merchantNormalized: 'gym' }),
      ),
    ];
    expect(fixedMonthlyCommitments(transactions, TODAY)).toBe(ILS(82));
  });

  it('בלי מנויים — אפס', () => {
    expect(fixedMonthlyCommitments([], TODAY)).toBe(0);
  });
});
