/**
 * מסך הפרטיות.
 *
 * כתוב בשפה פשוטה, וכולל גם את מה שלא נוח לומר: IndexedDB אינו מוצפן.
 * מסך פרטיות שמבטיח יותר ממה שהמערכת עושה גרוע ממסך פרטיות שאין.
 *
 * ⚠️ **v3 — אותה שפה כמו לוח הבקרה.** ההבטחה המרכזית עולה על הבאנר,
 * "מה נשמר" ו"מה לא" הם שני כרטיסים זה מול זה, וכל נושא מקבל מדליון.
 * הטקסט עצמו לא השתנה — הוא מדויק בכוונה.
 */

import { Page } from '../components/layout';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../AppData';
import { Card, CardTitle, Medallion } from '../components/ui';
import { FeatureCard, Pill, StatTile } from '../components/premium';
import { Icon } from '../components/icons';

function Point({ kept, children }: { kept: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${
          kept ? 'bg-brand-50 text-accent' : 'bg-alertred-100 text-danger'
        }`}
      >
        {kept ? (
          <span className="size-1.5 rounded-full bg-current" />
        ) : (
          <Icon name="close" className="size-3" />
        )}
      </span>
      <span>{children}</span>
    </li>
  );
}

export function Privacy() {
  const { snapshot } = useAppData();

  return (
    <Page
      title="מה נשמר ומה לא"
      icon="lock"
      subtitle="בדיוק מה המערכת שומרת — ומה לא"
      width="reading"
      overlap
    >
      <FeatureCard>
        <div className="flex items-start gap-4">
          <Medallion icon="shield-check" tone="brand" className="size-14" iconClassName="size-7" />
          <p className="text-sm leading-relaxed text-slate-700">
            הנתונים שלך נשמרים <strong>במכשיר הזה</strong>, באחסון של הדפדפן. אם הפעלת סנכרון,
            נשלח לענן רק עותק <strong>מוצפן</strong> — לשרת אין את המפתח, והוא לא יכול לראות סכומים,
            שמות או קטגוריות.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Pill tone="brand" icon="lock">
            נשמר במכשיר
          </Pill>
          <Pill tone="brand" icon="cloud">
            לענן — רק מוצפן
          </Pill>
          <Pill icon="close">בלי פרטי בנק</Pill>
        </div>
      </FeatureCard>

      <div className="grid gap-4 sm:grid-cols-2 lg:gap-6">
        <Card>
          <CardTitle icon="save" iconTone="brand">
            מה נשמר
          </CardTitle>
          <ul className="space-y-2.5 text-sm leading-relaxed text-slate-700">
            <Point kept>יתרות הפתיחה של חשבון הבנק והמזומן</Point>
            <Point kept>העסקאות שהזנת — תאריך, סכום, שם המקום, קטגוריה והערה</Point>
            <Point kept>הקטגוריות שלך</Point>
            <Point kept>היעד, סכום הביטחון והעדפות התצוגה</Point>
          </ul>
          {snapshot ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <StatTile
                label="עסקאות שמורות"
                value={<span className="num">{snapshot.transactions.length}</span>}
              />
              <StatTile
                label="קטגוריות"
                value={<span className="num">{snapshot.categories.length}</span>}
              />
            </div>
          ) : null}
        </Card>

        <Card>
          <CardTitle icon="eye-off" iconTone="danger">
            מה לא נשמר — ולא ייווצר
          </CardTitle>
          <ul className="space-y-2.5 text-sm leading-relaxed text-slate-700">
            <Point kept={false}>שם, אימייל, טלפון או כתובת</Point>
            <Point kept={false}>סיסמה לבנק, שם משתמש או קוד אימות</Point>
            <Point kept={false}>מספר חשבון, מספר כרטיס אשראי, תעודת זהות או IBAN</Point>
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-slate-600">
            למערכת אין שדות כאלה בכלל. יש בדיקה אוטומטית שנכשלת אם מישהו מנסה להוסיף אותם.
          </p>
        </Card>
      </div>

      <Card tone="caution">
        <CardTitle icon="alert-triangle" iconTone="caution">
          מה שחשוב שתדע
        </CardTitle>
        <p className="text-sm leading-relaxed text-slate-700">
          האחסון של הדפדפן <strong>אינו מוצפן</strong>. מי שיש לו גישה למכשיר לא-נעול יכול, עם קצת
          ידע, לקרוא את הנתונים.
        </p>
        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-800">
          ההגנה האמיתית היא נעילת המסך של הטלפון.
        </p>
      </Card>

      <Card>
        <CardTitle icon="lock">קוד הנעילה של האפליקציה</CardTitle>
        {/* ⚠️ הניסוח הזה מכוון ומדויק. קוד נעילה שמוצג כ"הצפנה" מייצר
            ביטחון מדומה, והמשתמש מפסיק לנעול את הטלפון עצמו — כלומר
            ההגנה האמיתית נחלשת בגלל הגנה מדומה. */}
        <p className="text-sm leading-relaxed text-slate-700">
          קוד הנעילה מונע גישה מזדמנת לאפליקציה.{' '}
          <strong>הוא אינו מצפין את מסד הנתונים המקומי.</strong>
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          הוא עוזר כשמישהו לוקח את הטלפון לרגע. הוא לא עוזר מול מי שיודע לפתוח את כלי הפיתוח של
          הדפדפן.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          הקוד עצמו לא נשמר — נשמר ממנו ערך אימות חד-כיווני בלבד. לכן אין דרך לשחזר קוד שנשכח.
        </p>
      </Card>

      <Card>
        <CardTitle icon="download">קובץ הגיבוי</CardTitle>
        <p className="text-sm leading-relaxed text-slate-700">
          הגיבוי הוא הדבר היחיד שיכול לעזוב את המכשיר — ורק אם אתה בוחר לשמור אותו במקום אחר, כמו
          Drive או אימייל. שם הוא כבר לא מוגן על ידי המכשיר שלך.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          לכן אפשר להצפין אותו בסיסמה. הסיסמה לא נשמרת בשום מקום — בלעדיה גם אנחנו לא נוכל לפתוח
          את הקובץ.
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:gap-6">
        <Card>
          <CardTitle icon="credit-card">חיבור לבנק</CardTitle>
          <p className="text-sm leading-relaxed text-slate-700">
            אין, והמערכת לא מבקשת פרטי התחברות לעולם. גישה אוטומטית לנתוני בנק בישראל מחייבת רישיון
            מרשות ניירות ערך, והשירותים המורשים מוגבלים לגיל 18 ומעלה.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            בשלב הבא תוכל לייבא בעצמך קובץ עסקאות שהורדת מאתר הבנק. הקובץ ינותח כאן במכשיר ולא יישלח
            לשום מקום.
          </p>
        </Card>

        <Card>
          <CardTitle icon="info">זו לא ייעוץ פיננסי</CardTitle>
          <p className="text-sm leading-relaxed text-slate-700">
            המערכת מחשבת ומציגה את הנתונים שלך. היא לא מציעה השקעות, אשראי או הלוואות, וכל תחזית בה
            היא תרחיש לפי מה שהוזן — לא הבטחה.
          </p>
        </Card>
      </div>

      <div className="pb-6 text-center">
        <Link
          to="/settings"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200/70 bg-surface px-4 text-sm font-semibold text-accent elev-1 transition hover:border-slate-300"
        >
          ← חזרה להגדרות
        </Link>
      </div>
    </Page>
  );
}
