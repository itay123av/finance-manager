import { describe, expect, it } from 'vitest';
import {
  goalAlternatives,
  goalProgress,
  projectGoal,
  requiredRegularNetForDate,
  type GoalAlternativesInput,
} from '../../core/goal';
import { ILS, goal } from '../helpers';

const TODAY = '2026-08-07';

function sim(overrides: Partial<GoalAlternativesInput> = {}): GoalAlternativesInput {
  return {
    today: TODAY,
    currentBalanceAgorot: ILS(1240),
    targetAgorot: ILS(5000),
    regularMonthlyNetAgorot: ILS(200),
    summerTotalNetAgorot: 0,
    historicalConfidence: 'high',
    ...overrides,
  };
}

describe('התקדמות ליעד', () => {
  it('אחוז, פער והתקדמות מאז ההתחלה', () => {
    const p = goalProgress(goal(), ILS(1250));
    expect(p.progressPct).toBe(25);
    expect(p.gapAgorot).toBe(ILS(3750));
    expect(p.sinceStartAgorot).toBe(ILS(550));
    expect(p.isAchieved).toBe(false);
    expect(p.messageHe).toContain('מאז שהתחלת');
  });

  it('0% כשאין כלום', () => {
    expect(goalProgress(goal(), 0).progressPct).toBe(0);
  });

  it('לא עובר 100% גם כשעברת את היעד', () => {
    const p = goalProgress(goal(), ILS(7000));
    expect(p.progressPct).toBe(100);
    expect(p.gapAgorot).toBe(0);
    expect(p.isAchieved).toBe(true);
    expect(p.messageHe).toContain('לשמור');
  });

  it('יתרה שלילית לא נותנת אחוז שלילי', () => {
    expect(goalProgress(goal(), ILS(-300)).progressPct).toBe(0);
  });

  it('יעד אפס לא מפיל את החישוב', () => {
    expect(goalProgress(goal({ targetAgorot: 0 }), ILS(100)).progressPct).toBe(100);
  });

  it('יעדי ביניים — מסמן מה הושג ומה הבא בתור', () => {
    const p = goalProgress(goal(), ILS(1250));
    expect(p.milestones.map((m) => m.reached)).toEqual([true, false, false]);
    expect(p.nextMilestone?.amountAgorot).toBe(ILS(2500));
    expect(p.messageHe).toContain('₪2,500');
  });

  it('כשכל יעדי הביניים הושגו — אין הבא בתור', () => {
    const p = goalProgress(goal({ milestones: [ILS(100)] }), ILS(1250));
    expect(p.nextMilestone).toBeNull();
    expect(p.messageHe).toContain('עד היעד');
  });

  it('יעד ביניים אפס לא גורם לחלוקה באפס', () => {
    const p = goalProgress(goal({ milestones: [0] }), ILS(1250));
    expect(p.milestones[0]?.progressPct).toBe(100);
  });
});

describe('⭐ סימולטור — הכנסה קבועה', () => {
  it('נטו חיובי קבוע → מגיעים ליעד', () => {
    const p = projectGoal(sim({ regularMonthlyNetAgorot: ILS(500) }));
    // פער 3760, 500 לחודש → 8 חודשים (בחודש 8 היתרה 5240)
    expect(p.monthsToGoal).toBe(8);
    expect(p.reachMonth).toBe('2027-04');
    expect(p.path).toHaveLength(8);
  });

  it('הספירה מתחילה מהחודש הבא — הטיה מכוונת לצד הזהיר', () => {
    const p = projectGoal(sim({ regularMonthlyNetAgorot: ILS(500) }));
    expect(p.path[0]?.month).toBe('2026-09');
    expect(p.assumptions.countsFullMonthsFromNextMonth).toBe(true);
  });

  it('יעד שכבר הושג → אפס חודשים', () => {
    const p = projectGoal(sim({ currentBalanceAgorot: ILS(5200) }));
    expect(p.monthsToGoal).toBe(0);
    expect(p.path).toHaveLength(0);
    expect(p.messageHe).toContain('כבר הגעת');
  });
});

describe('⭐⭐ סימולטור — רק הכנסת קיץ (המקרה שחילוק פשוט נכשל בו)', () => {
  const seasonal = sim({
    currentBalanceAgorot: ILS(1240),
    regularMonthlyNetAgorot: ILS(-150), // שוחקים בחורף
    summerTotalNetAgorot: ILS(4000), // ומרוויחים בקיץ
  });

  it('מגיעים ליעד — אבל רק אחרי שני קיצים', () => {
    const p = projectGoal(seasonal);
    expect(p.monthsToGoal).toBe(24);
    // ספט'26–יוני'27 שוחקים ל-‎−260, קיץ'27 מקפיץ ל-3,740 — עדיין לא מספיק.
    // עוד חורף מוריד ל-2,240, וקיץ'28 מסיים ב-6,240.
    expect(p.reachMonth).toBe('2028-08');
  });

  it('החישוב הנאיבי היה נותן תשובה שגויה — ומטעה לכיוון האופטימי', () => {
    const p = projectGoal(seasonal);
    // ממוצע שנתי: (10×(−150) + 4000) / 12 = ‎+208 לחודש
    const naiveMonths = Math.ceil(ILS(3760) / ILS(208));
    expect(naiveMonths).toBe(19);
    // המציאות: 24 חודשים. החילוק הפשוט מבטיח חמישה חודשים שלא קיימים,
    // כי הוא "מורח" את כסף הקיץ על כל חודשי השנה.
    expect(p.monthsToGoal).toBe(24);
    expect(p.monthsToGoal as number).toBeGreaterThan(naiveMonths);
  });

  it('היתרה יורדת עד הקיץ ואז קופצת', () => {
    const p = projectGoal(seasonal);
    const june = p.path.find((x) => x.month === '2027-06');
    const july = p.path.find((x) => x.month === '2027-07');
    expect(june?.balanceAgorot).toBeLessThan(ILS(1240));
    expect(july?.balanceAgorot).toBeGreaterThan(june?.balanceAgorot ?? 0);
    expect(july?.isSummer).toBe(true);
  });

  it('ההכנסה העונתית מתחלקת שווה בין יולי לאוגוסט', () => {
    const p = projectGoal(seasonal);
    expect(p.assumptions.summerMonthlyBonusAgorot).toBe(ILS(2000));
  });

  it('⭐ הבונוס העונתי מתווסף לנטו הרגיל ולא מחליף אותו', () => {
    // ביולי יש הכנסת קיץ, אבל גם ההוצאות הרגילות ממשיכות: ‎−150 + 2000
    const p = projectGoal(seasonal);
    const june = p.path.find((x) => x.month === '2027-06')!;
    const july = p.path.find((x) => x.month === '2027-07')!;
    expect(july.balanceAgorot - june.balanceAgorot).toBe(ILS(1850));
  });

  it('בלי הכנסת קיץ, יולי ואוגוסט מתנהגים כחודשים רגילים', () => {
    const p = projectGoal(sim({ regularMonthlyNetAgorot: ILS(200), summerTotalNetAgorot: 0 }));
    const june = p.path.find((x) => x.month === '2027-06')!;
    const july = p.path.find((x) => x.month === '2027-07')!;
    expect(july.balanceAgorot - june.balanceAgorot).toBe(ILS(200));
  });
});

describe('⭐ סימולטור — כשלא מגיעים ליעד', () => {
  it('נטו שלילי בלי הכנסת קיץ → null, בלי הודעה מפחידה', () => {
    const p = projectGoal(sim({ regularMonthlyNetAgorot: ILS(-100), summerTotalNetAgorot: 0 }));
    expect(p.monthsToGoal).toBeNull();
    expect(p.reachMonth).toBeNull();
    expect(p.reachDate).toBeNull();
    expect(p.messageHe).toContain('חלופות');
    expect(p.messageHe).not.toMatch(/לא תצליח|נכשל|בעיה/);
  });

  it('נטו אפס → null', () => {
    expect(projectGoal(sim({ regularMonthlyNetAgorot: 0 })).monthsToGoal).toBeNull();
  });

  it('מפסיק אחרי maxMonths ולא נתקע בלולאה אינסופית', () => {
    const p = projectGoal(sim({ regularMonthlyNetAgorot: ILS(1), maxMonths: 12 }));
    expect(p.monthsToGoal).toBeNull();
    expect(p.path).toHaveLength(12);
  });
});

describe('רמת ביטחון של התחזית', () => {
  it('תחזית רחוקה מוגבלת ל-low גם עם נתונים מצוינים', () => {
    const p = projectGoal(sim({ regularMonthlyNetAgorot: ILS(200), historicalConfidence: 'high' }));
    expect(p.monthsToGoal).toBeGreaterThan(6);
    expect(p.confidence).toBe('low');
    expect(p.requiresFarHorizonWarning).toBe(true);
  });

  it('יעד קרוב עם נתונים טובים → ביטחון גבוה', () => {
    const p = projectGoal(sim({ currentBalanceAgorot: ILS(4900), regularMonthlyNetAgorot: ILS(200) }));
    expect(p.monthsToGoal).toBe(1);
    expect(p.confidence).toBe('high');
  });

  it('נתונים דלים גוברים על טווח קצר', () => {
    const p = projectGoal(
      sim({ currentBalanceAgorot: ILS(4900), regularMonthlyNetAgorot: ILS(200), historicalConfidence: 'low' }),
    );
    expect(p.confidence).toBe('low');
  });
});

describe('חלופות', () => {
  it('אין חלופות כשהיעד כבר הושג', () => {
    expect(goalAlternatives(sim({ currentBalanceAgorot: ILS(5200) }))).toEqual([]);
  });

  it('מציעה להזיז תאריך יעד כשהיעד ניתן להשגה מאוחר יותר', () => {
    const alts = goalAlternatives(sim({ regularMonthlyNetAgorot: ILS(200) }));
    expect(alts.some((a) => a.id === 'extend_target_date')).toBe(true);
  });

  it('מציעה יעדי ביניים תמיד', () => {
    const alts = goalAlternatives(sim({ regularMonthlyNetAgorot: ILS(-100) }));
    expect(alts.some((a) => a.id === 'intermediate_milestones')).toBe(true);
  });

  it('מחשבת בכמה צריך לצמצם כדי לעמוד בתאריך היעד', () => {
    const alts = goalAlternatives(
      sim({ regularMonthlyNetAgorot: ILS(100), targetDate: '2027-02-28' }),
    );
    const reduce = alts.find((a) => a.id === 'reduce_monthly_spending');
    expect(reduce).toBeDefined();
    expect(reduce?.monthlyDeltaAgorot).toBeGreaterThan(0);
  });

  it('מציינת את הקטגוריה שהכי קל להתחיל ממנה', () => {
    const alts = goalAlternatives(
      sim({
        regularMonthlyNetAgorot: ILS(100),
        targetDate: '2027-02-28',
        largestReducibleCategoryName: 'אוכל בחוץ',
      }),
    );
    expect(alts.find((a) => a.id === 'reduce_monthly_spending')?.detailHe).toContain('אוכל בחוץ');
  });

  it('מציעה לשמור יותר מכסף הקיץ כשיש הכנסה עונתית', () => {
    const alts = goalAlternatives(sim({ summerTotalNetAgorot: ILS(4000) }));
    expect(alts.some((a) => a.id === 'save_more_of_summer')).toBe(true);
  });

  it('בלי הכנסת קיץ — מציעה להוסיף הכנסה', () => {
    const alts = goalAlternatives(sim({ summerTotalNetAgorot: 0 }));
    expect(alts.some((a) => a.id === 'add_income')).toBe(true);
  });
});

describe('requiredRegularNetForDate', () => {
  it('מחשב את הנטו החודשי הדרוש', () => {
    // 6 חודשים קדימה, פער 3760, בלי קיץ בדרך (ספט-פבר)
    const required = requiredRegularNetForDate(sim({ targetDate: '2027-02-28' }));
    expect(required).toBe(Math.round(ILS(3760) / 6));
  });

  it('מפחית את תרומת חודשי הקיץ', () => {
    const withSummer = requiredRegularNetForDate(
      sim({ targetDate: '2027-08-31', summerTotalNetAgorot: ILS(4000) }),
    );
    const withoutSummer = requiredRegularNetForDate(sim({ targetDate: '2027-08-31' }));
    expect(withSummer as number).toBeLessThan(withoutSummer as number);
  });

  it('null כשאין תאריך יעד או שהתאריך עבר', () => {
    expect(requiredRegularNetForDate(sim())).toBeNull();
    expect(requiredRegularNetForDate(sim({ targetDate: '2026-08-01' }))).toBeNull();
  });

  it('טווח שכולו חודשי קיץ עדיין ניתן לחישוב — גם בקיץ יש נטו רגיל', () => {
    const required = requiredRegularNetForDate(
      sim({ today: '2026-06-15', targetDate: '2026-08-31', summerTotalNetAgorot: ILS(1000) }),
    );
    // 2 חודשים, פער 3760, בונוס 500 לכל חודש קיץ → (3760 − 1000) / 2
    expect(required).toBe(ILS(1380));
  });
});
