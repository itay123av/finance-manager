/**
 * ════════════════════════════════════════════════════════════════════════
 *  שומרי פרטיות — הבדיקות האלה נכשלות אם מישהו (כולל אני, בעוד חצי שנה)
 *  מנסה להוסיף שדה או התנהגות שהובטח שלא יהיו.
 *
 *  הן לא בודקות לוגיקה עסקית. הן אוכפות הבטחות.
 * ════════════════════════════════════════════════════════════════════════
 */

import { describe, expect, it } from 'vitest';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';

/** `statSync` שלא זורק כשהנתיב אינו קיים. */
function statSyncSafe(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

function readText(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), 'utf8');
}

/**
 * מסיר הערות לפני סריקה.
 *
 * ⚠️ בלי זה, הערה שמזהירה מפני סכנה נספרת כסכנה — והדרך הקלה
 * "לתקן" את הבדיקה היא למחוק את האזהרה. זה בדיוק ההפך מהרצוי.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(join(ROOT, dir));
  } catch {
    return out;
  }
  for (const entry of entries) {
    const relPath = `${dir}/${entry}`;
    if (statSync(join(ROOT, relPath)).isDirectory()) out.push(...walkTsFiles(relPath));
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(relPath);
  }
  return out;
}

// ---------------------------------------------------------------------------

describe('🔒 קבצי נתונים אמיתיים לא נכנסים ל-git', () => {
  const gitignore = readText('.gitignore');

  it('התיקייה private-data/ מוגנת', () => {
    expect(gitignore).toContain('private-data/');
  });

  it('קובצי בנק ותוצרי ייצוא מוגנים לפי סיומת', () => {
    for (const pattern of ['*.csv', '*.xls', '*.xlsx', 'backup-*.json']) {
      expect(gitignore).toContain(pattern);
    }
  });

  it('קובצי סביבה מוגנים, אך .env.example נשמר', () => {
    expect(gitignore).toContain('.env');
    expect(gitignore).toContain('!.env.example');
  });

  it('קובץ הדוגמה לסביבה אינו מכיל סוד אמיתי', () => {
    // רק שורות שאינן הערה נבדקות — הקובץ כולו הסברים ודוגמאות מנוטרלות.
    const assignments = readText('.env.example')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));
    expect(assignments).toEqual([]);
  });
});

describe('🔒 שדות אסורים — אין ולא יהיה מקום לפרטי התחברות', () => {
  /**
   * אם אחד מהשמות האלה מופיע בקוד המקור, מישהו התחיל לבנות שמירה של
   * פרטי בנק. זה בדיוק מה שהובטח שלא יקרה.
   */
  const FORBIDDEN = [
    'password',
    'passwd',
    'otp',
    'verificationCode',
    'idNumber',
    'nationalId',
    'accountNumber',
    'cardNumber',
    'creditCardNumber',
    'iban',
    'cvv',
    'accessToken',
    'refreshToken',
  ];

  const sourceFiles = [
    ...walkTsFiles('src/core'),
    ...walkTsFiles('src/content'),
    ...walkTsFiles('src/dev'),
    ...walkTsFiles('src/data'),
  ];

  it('נסרקו קבצי מקור', () => {
    expect(sourceFiles.length).toBeGreaterThan(20);
  });

  it('סכמות הוולידציה אינן מגדירות שדה של פרטי התחברות', () => {
    const schema = readText('src/data/schema.ts');
    for (const field of FORBIDDEN) {
      expect(schema, `schema.ts מגדיר ${field}`).not.toMatch(new RegExp(`\\b${field}\\b\\s*:`, 'i'));
    }
  });

  /**
   * חריגים מכוונים ומצומצמים למילה `password`.
   *
   * ⚠️ כל חריג כאן חייב בדיקה משלו שמוכיחה שהסיסמה **עוברת כפרמטר
   * ולא נשמרת**. חריג בלי הוכחה הוא חור, לא חריג.
   *
   * - `backup.ts` — סיסמה להצפנת קובץ הגיבוי, נבחרת ברגע הייצוא.
   * - `sync/vault.ts` — אותה סיסמה בדיוק, בדרך להצפנת הבלוב שנשלח לענן.
   * - `sync/client.ts` — סיסמת **החשבון** מול שירות הסנכרון. זו
   *   הסיסמה היחידה שעוזבת את המכשיר, והיא נפרדת מסיסמת ההצפנה.
   *
   * ⚠️ אף אחד מהם אינו סיסמת בנק. האיסור על פרטי בנק נשאר מוחלט.
   */
  const PASSPHRASE_EXEMPT = 'src/data/backup.ts';
  const PASSWORD_EXEMPT = [
    PASSPHRASE_EXEMPT,
    'src/data/sync/vault.ts',
    'src/data/sync/client.ts',
    // סיסמת חשבון **נגזרת** מקוד החיבור. לא נבחרת, לא מוקלדת ולא נשמרת.
    'src/data/sync/identity.ts',
  ];

  it('אף שדה אסור לא מופיע בקוד', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const content = readText(file);
      for (const field of FORBIDDEN) {
        if (PASSWORD_EXEMPT.includes(file) && field === 'password') continue;
        // חיפוש כשם מזהה, לא כחלק ממילה אחרת
        const asProperty = new RegExp(`\\b${field}\\b\\s*[?:]`, 'i');
        if (asProperty.test(content)) offenders.push(`${file} → ${field}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('⭐ סיסמת הגיבוי לעולם אינה נשמרת', () => {
    const backup = readText(PASSPHRASE_EXEMPT);

    // אסור שהסיסמה תגיע לכתיבה כלשהי לבסיס הנתונים או להגדרות
    expect(backup).not.toMatch(/(put|add|bulkPut|saveSettings)\([^)]*password/i);
    // ואסור שתיכנס לאובייקט קובץ הגיבוי עצמו
    expect(backup).not.toMatch(/(payload|kdf|cipher|data)\s*:\s*[^,\n]*password/i);
    // השימוש היחיד המותר: גזירת מפתח הצפנה
    expect(backup).toContain('deriveKey(options.password');
    expect(backup).toContain('deriveKey(password');

    // הסכמה שנשמרת אינה מכילה סיסמה כלל
    expect(readText('src/data/schema.ts')).not.toMatch(/password/i);
  });

  /**
   * ⭐ אותה הוכחה, עבור הסנכרון.
   *
   * הסיכון כאן חמור יותר מאשר בגיבוי: סיסמה שתישמר לצד הבלוב תהפוך
   * את ההצפנה מקצה לקצה לחסרת ערך.
   */
  it('⭐ סיסמת ההצפנה של הסנכרון אינה נשמרת ואינה נשלחת', () => {
    const vault = stripComments(readText('src/data/sync/vault.ts'));

    // לא נכתבת לבסיס הנתונים ולא להגדרות
    expect(vault).not.toMatch(/(put|add|bulkPut|saveSettings)\([^)]*passphrase/i);
    // לא נכנסת לאובייקט שנשלח לשרת
    expect(vault).not.toMatch(/ciphertext\s*:\s*[^,\n]*passphrase/i);
    // ולא לאחסון הדפדפן
    expect(vault).not.toMatch(/(localStorage|sessionStorage)/);

    // ⭐ הסיסמה עוברת רק לשכבת ההצפנה הקיימת והבדוקה
    expect(vault).toContain('serializeBackup(data, { password: passphrase');
    expect(vault).toContain('readBackup(ciphertext, passphrase)');
  });

  it('⭐ סיסמת החשבון אינה נשמרת בשום מקום', () => {
    const client = stripComments(readText('src/data/sync/client.ts'));

    expect(client).not.toMatch(/(localStorage|sessionStorage)\.[a-z]+\([^)]*password/i);
    expect(client).not.toMatch(/(put|add|bulkPut|saveSettings)\([^)]*password/i);
    // השימוש המותר היחיד: העברה לשירות ההתחברות
    expect(client).toMatch(/signInWithPassword\(\{ email, password \}\)/);
  });

  /**
   * ⭐ קוד החיבור הוא גם המפתח לנתונים.
   *
   * ⚠️ אם הקוד הגולמי יישלח לשרת — כסיסמה או כאימייל — השרת יחזיק
   * את החומר שממנו נגזר מפתח ההצפנה, וההצפנה מקצה לקצה תהפוך
   * לקישוט. הבדיקה מוודאת שהקוד עובר רק דרך הגזירה החד־כיוונית.
   */
  it('⭐ קוד החיבור אינו נשלח לשרת בשום מסלול', () => {
    const pairing = stripComments(readText('src/data/sync/pairing.ts'));

    // ההרשמה וההתחברות מקבלות את הערכים הנגזרים בלבד
    expect(pairing).toMatch(/signUp\(identity\.email, identity\.password\)/);
    expect(pairing).toMatch(/signIn\(identity\.email, identity\.password\)/);

    // ⭐ והקוד עצמו לא מועבר לאף פונקציית רשת
    expect(pairing).not.toMatch(/sign(Up|In)\([^)]*\bcode\b/);
    expect(pairing).not.toMatch(/pushVault\([^)]*\bcode\b/);
  });

  /**
   * ⭐ מפתח `service_role` עוקף RLS לחלוטין. אם הוא יגיע לקוד לקוח,
   * כל מי שיפתח את קוד המקור של האתר יוכל לקרוא ולמחוק את הנתונים
   * של כל המשתמשים.
   */
  it('⭐ אין מפתח service_role בקוד', () => {
    for (const file of sourceFiles) {
      expect(stripComments(readText(file)), `${file} מכיל service_role`).not.toMatch(
        /service_role|service-role/i,
      );
    }
  });

  it('הטיפוסים לא מגדירים ישות של פרטי התחברות', () => {
    const types = readText('src/core/types.ts');
    expect(types).not.toMatch(/interface\s+(Credential|BankLogin|Session|Auth)/i);
  });
});

describe('🔒 אין הדפסה ללוג בשכבות שנוגעות בכסף', () => {
  it('core/, content/ ו-data/ נקיים מ-console', () => {
    const offenders: string[] = [];
    for (const file of [
      ...walkTsFiles('src/core'),
      ...walkTsFiles('src/content'),
      ...walkTsFiles('src/data'),
    ]) {
      if (/\bconsole\s*\./.test(readText(file))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('הודעות שגיאה אינן חושפות סכומים, שמות בתי עסק או תוכן עסקאות', () => {
    // מותר להזכיר מספר גרסה; אסור להדליף נתונים פיננסיים לתוך טקסט שגיאה.
    const leaky = /\$\{[^}]*\b(amount|merchant|balance|note|agorot|transaction)/i;
    for (const file of [...walkTsFiles('src/data'), ...walkTsFiles('src/core')]) {
      const content = readText(file);
      for (const match of content.matchAll(/new \w*Error\(([^;]+)/g)) {
        expect(match[1] ?? '', `${file}: ${match[1]}`).not.toMatch(leaky);
      }
    }
  });
});

describe('🔒 core/ נשאר טהור — בלי רשת, אחסון או שעון', () => {
  const coreFiles = walkTsFiles('src/core');

  it('אין קריאות רשת', () => {
    for (const file of coreFiles) {
      expect(readText(file), file).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket/);
    }
  });

  it('אין גישה לאחסון או ל-DOM', () => {
    for (const file of coreFiles) {
      expect(readText(file), file).not.toMatch(/localStorage|sessionStorage|indexedDB|\bdocument\b/);
    }
  });

  it('⭐ אין קריאה לשעון — "עכשיו" מגיע תמיד כפרמטר', () => {
    // בלי זה אי אפשר לבדוק תרחישי זמן, וכל בדיקה הייתה נשברת בחצות.
    for (const file of coreFiles) {
      expect(readText(file), file).not.toMatch(/new Date\(\s*\)|Date\.now\s*\(/);
    }
  });

  it('אין תלות חיצונית — core מיובא רק מתוך עצמו', () => {
    for (const file of coreFiles) {
      const imports = [...readText(file).matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      for (const spec of imports) {
        expect(spec, `${file} מייבא ${spec}`).toMatch(/^\.\//);
      }
    }
  });
});

describe('🔒 מדיניות אבטחת תוכן', () => {
  const html = readText('index.html');
  const headers = readText('public', '_headers');

  /**
   * ⭐ עד v1.1 היה כאן `connect-src 'none'` — חסימה מוחלטת.
   *
   * v1.2 הוסיפה סנכרון, ולכן ההבטחה השתנתה. הבדיקה לא נמחקה אלא
   * הוחלפה בהבטחה מדויקת יותר, ובמובן מסוים קשה יותר לשמירה:
   * **יעד יוצא אחד בדיוק, מפורש בשמו.**
   *
   * ⚠️ הדבר שהבדיקה הזו באמת מונעת הוא ההרחבה השקטה. `connect-src *`
   * או `https:` היו "מתקנים" כל תקלת רשת עתידית תוך שנייה — ומבטלים
   * את ההגנה כולה, כי אז קוד שיוזרק יוכל לשלוח את הנתונים לכל מקום.
   */
  const ALLOWED_HOST = 'https://mregcidikhfzmflofkzz.supabase.co';

  function connectSrcOf(policy: string): string[] {
    const directive = policy.split(';').find((part) => part.trim().startsWith('connect-src'));
    expect(directive, 'אין הנחיית connect-src').toBeDefined();
    return directive!.trim().split(/\s+/).slice(1);
  }

  it('⭐ connect-src מתיר יעד חיצוני אחד בלבד, ולא תווים כלליים', () => {
    for (const [name, policy] of [
      ['index.html', html],
      ['_headers', headers],
    ] as const) {
      const sources = connectSrcOf(policy);

      // אין פתח גורף
      for (const wildcard of ['*', 'https:', 'http:', 'data:', "'unsafe-eval'"]) {
        expect(sources, `${name} מתיר ${wildcard}`).not.toContain(wildcard);
      }
      expect(sources.some((s) => s.includes('*')), `${name} מכיל תו כללי`).toBe(false);

      // ⭐ בדיוק היעד המוכר, ולא אחד נוסף
      const external = sources.filter((s) => s !== "'self'");
      expect(external, `${name} מתיר יעדים לא צפויים`).toEqual([ALLOWED_HOST]);
    }
  });

  it('⭐ הכתובת ב-CSP זהה לזו שהקוד באמת פונה אליה', () => {
    // הפרדה בין השתיים הייתה מייצרת סנכרון שנכשל בלי סיבה נראית לעין.
    expect(readText('src/data/sync/config.ts')).toContain(ALLOWED_HOST);
  });

  it('חסימת מסגור, sniffing והפניות', () => {
    expect(headers).toContain('X-Content-Type-Options: nosniff');
    expect(headers).toContain('Referrer-Policy: no-referrer');

    // ⚠️ `frame-ancestors` נאכף רק כ-HTTP header. בתוך <meta> הדפדפן
    // מתעלם ממנו ומדפיס שגיאה, ולכן הוא נמצא ב-_headers בלבד.
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).toContain('X-Frame-Options: DENY');

    // בודקים את תוכן ה-meta עצמו, לא את הקובץ כולו — הערה שמסבירה
    // למה ההנחיה לא נמצאת שם היא בדיוק מה שאנחנו רוצים שיישאר
    const metaContent = html.match(
      /http-equiv="Content-Security-Policy"\s*\n?\s*content="([^"]+)"/,
    )?.[1];
    expect(metaContent).toBeDefined();
    expect(metaContent).not.toContain('frame-ancestors');
  });

  it('העמוד אינו מיועד לאינדוקס', () => {
    expect(headers).toContain('X-Robots-Tag: noindex');
    expect(readText('public', 'robots.txt')).toContain('Disallow: /');
  });

  it('אין source maps ב-production', () => {
    expect(readText('vite.config.ts')).toContain('sourcemap: false');
  });

  it('הכיוון והשפה מוגדרים לעברית', () => {
    expect(html).toContain('lang="he"');
    expect(html).toContain('dir="rtl"');
  });
});

describe('🔒 הפרדה בין נתוני דוגמה לנתונים אמיתיים', () => {
  it('נתוני הזרע מסומנים במפורש כפיקטיביים', () => {
    const seed = readText('src/dev/seed/fakeUser.ts');
    expect(seed).toContain('פיקטיביים');
    expect(seed).toMatch(/אין כאן שום נתון אמיתי/);
  });

  it('הזרע לא מיובא מקוד האפליקציה', () => {
    for (const file of [...walkTsFiles('src/core'), ...walkTsFiles('src/content')]) {
      expect(readText(file), file).not.toContain('dev/seed');
    }
  });

  it('מסמך הפרטיות מצהיר על המגבלה האמיתית ולא מבטיח הצפנה שאין', () => {
    const privacy = readText('PRIVACY.md');
    expect(privacy).toContain('IndexedDB אינו מוצפן');
    expect(privacy).toContain('ההגנה האמיתית היא נעילת המסך');
    // קוד הנעילה חייב להיות מוצג כהרתעה, לא כהצפנה
    expect(privacy).toContain('הוא אינו הצפנה');
  });

  /**
   * ⭐ מסמך הפרטיות חייב לתאר את v1.2 כפי שהיא.
   *
   * ⚠️ המשפט "אין קריאות רשת בזמן ריצה" היה נכון עד v1.1 והוא נוח
   * מאוד — בדיוק לכן קל להחזיר אותו בטעות בעריכה עתידית. מרגע
   * שקיים סנכרון הוא הבטחת שווא, והבדיקה הזו נכשלת אם הוא חוזר.
   */
  it('⭐ המסמך אינו מבטיח "אפס רשת" אחרי שנוסף סנכרון', () => {
    const privacy = readText('PRIVACY.md');

    expect(privacy).not.toContain('אין קריאות רשת בזמן ריצה');
    expect(privacy).not.toContain("connect-src 'none'  ");

    // ומצהיר במפורש על מה שכן קורה
    expect(privacy).toContain('כבוי כברירת מחדל');
    expect(privacy).toContain('בלוב אחד מוצפן');

    // ⚠️ שתי האזהרות שאסור שייעלמו בעריכה: אין שחזור, והקוד שווה
    // ערך לגישה מלאה. בלעדיהן המשתמש בוחר בלי לדעת מה הוא מסכן.
    expect(privacy).toContain('אין שחזור');
    expect(privacy).toContain('העותק בענן אבוד');
    expect(privacy).toContain('שווה ערך לגישה מלאה');
  });
});

describe('🔒 מבנה הפרויקט', () => {
  /**
   * `private-data/` הוא המקום המיועד לקובצי בנק אמיתיים בזמן פיתוח.
   * הוא מוגן ב-`.gitignore`, ולכן קובץ שיושב בו הוא תקין לחלוטין —
   * מה שאסור הוא קובץ נתונים **מחוץ** לו, שם הוא עלול להיכנס ל-commit.
   */
  const DATA_FILE = /\.(csv|xls|xlsx|ofx|qif)$/i;
  const ALLOWED = ['private-data/', 'src/tests/fixtures/'];

  it('קובצי נתונים קיימים רק בתיקיות המוגנות', () => {
    const stray: string[] = [];
    const scan = (dir: string) => {
      let entries: string[];
      try {
        entries = readdirSync(join(ROOT, dir));
      } catch {
        return;
      }
      for (const entry of entries) {
        if (['node_modules', '.git', 'coverage', 'dist', 'dev-dist'].includes(entry)) continue;
        const relPath = dir ? `${dir}/${entry}` : entry;
        if (statSync(join(ROOT, relPath)).isDirectory()) scan(relPath);
        else if (DATA_FILE.test(entry) && !ALLOWED.some((ok) => relPath.startsWith(ok))) {
          stray.push(relPath);
        }
      }
    };
    scan('');
    expect(stray).toEqual([]);
  });

  /**
   * ⭐ שמות בתי עסק אמיתיים אסורים בקוד.
   *
   * נכשלתי בזה פעם אחת: שמות מקובץ האשראי האמיתי הגיעו לתוך בדיקה
   * ולתוך הערה בקוד. הבדיקה הזו סורקת את כל המקור מול שמות בתי העסק
   * שמופיעים בקבצים שב-`private-data/`, כדי שזה לא יקרה שוב.
   */
  it('⭐ אין שמות בתי עסק מקבצים אמיתיים בקוד', () => {
    const privateDir = join(ROOT, 'private-data');
    if (!statSyncSafe(privateDir)) return; // אין קבצים אמיתיים — אין מה לבדוק

    // שמות ומזהים שנצפו בקבצים האמיתיים ואסור שיופיעו במקור
    const forbiddenMerchants = [
      'alphamen',
      'נאייקס',
      'ANTHROPIC',
      'GOOGLE*',
      'CLAUDE.AI',
      'רויאל קלאב',
      'טוסטkiv',
      'אורשר',
      'אבנר',
      'עומרי',
      // ⚠️ מספר חשבון מלא — אסור בשום צורה, גם לא כקלט לבדיקה
      '102605485',
      '251993533',
    ];

    const offenders: string[] = [];
    for (const file of [
      ...walkTsFiles('src/core'),
      ...walkTsFiles('src/content'),
      ...walkTsFiles('src/data'),
      ...walkTsFiles('src/import'),
      ...walkTsFiles('src/tests'),
      ...walkTsFiles('src/ui'),
    ]) {
      const content = readText(file);
      for (const name of forbiddenMerchants) {
        if (content.includes(name)) offenders.push(`${file} → ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('⭐ git לא עוקב אחרי אף קובץ נתונים', () => {
    // הבדיקה שבאמת מגנה: לא "איפה הקובץ יושב" אלא "האם הוא ייכנס ל-commit"
    const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter((path) => path !== '' && DATA_FILE.test(path))
      .filter((path) => !path.startsWith('src/tests/fixtures/'));
    expect(tracked).toEqual([]);
  });

  it('⭐ קובץ בנק שיושב ב-private-data באמת בלתי נראה ל-git', () => {
    const probe = join(ROOT, 'private-data', 'gitignore-probe.csv');
    mkdirSync(join(ROOT, 'private-data'), { recursive: true });
    writeFileSync(probe, 'תאריך,סכום\n05/08/2026,-64.00\n');
    try {
      const status = execSync('git status --porcelain --untracked-files=all', {
        cwd: ROOT,
        encoding: 'utf8',
      });
      expect(status).not.toContain('gitignore-probe.csv');
    } finally {
      rmSync(probe, { force: true });
    }
  });
});
