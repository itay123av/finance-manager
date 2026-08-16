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
   * חריג יחיד ומכוון: `backup.ts` מקבל סיסמה להצפנת **קובץ הגיבוי**.
   * זו סיסמה שהמשתמש בוחר ברגע הייצוא, היא עוברת כפרמטר בלבד, ואינה
   * נשמרת בשום מקום — לא בבסיס הנתונים, לא בהגדרות ולא בקובץ עצמו.
   * הבדיקה שאחריה מוודאת בדיוק את זה.
   */
  const PASSPHRASE_EXEMPT = 'src/data/backup.ts';

  it('אף שדה אסור לא מופיע בקוד', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const content = readText(file);
      for (const field of FORBIDDEN) {
        if (file === PASSPHRASE_EXEMPT && field === 'password') continue;
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

  it('connect-src חסום לחלוטין — נתונים לא יכולים לצאת', () => {
    expect(html).toContain("connect-src 'none'");
    expect(headers).toContain("connect-src 'none'");
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
