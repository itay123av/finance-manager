/**
 * מסך הפרטיות.
 *
 * כתוב בשפה פשוטה, וכולל גם את מה שלא נוח לומר: IndexedDB אינו מוצפן.
 * מסך פרטיות שמבטיח יותר ממה שהמערכת עושה גרוע ממסך פרטיות שאין.
 */

import { Page } from '../components/layout';
import { Link } from 'react-router-dom';
import { useAppData } from '../AppData';
import { Card, CardTitle } from '../components/ui';

export function Privacy() {
  const { snapshot } = useAppData();

  return (
    <Page title="מה נשמר ומה לא" width="reading">

      <Card tone="brand">
        <p className="text-sm leading-relaxed text-accent-strong">
          כל הנתונים שלך נשמרים <strong>רק במכשיר הזה</strong>, באחסון של הדפדפן.
          אין שרת שמחזיק את העסקאות שלך, ואין לאפליקציה דרך לשלוח אותן לשום מקום.
        </p>
      </Card>

      <Card>
        <CardTitle>מה נשמר</CardTitle>
        <ul className="list-inside list-disc space-y-1.5 text-sm leading-relaxed text-slate-700">
          <li>יתרות הפתיחה של חשבון הבנק והמזומן</li>
          <li>העסקאות שהזנת — תאריך, סכום, שם המקום, קטגוריה והערה</li>
          <li>הקטגוריות שלך</li>
          <li>היעד, סכום הביטחון והעדפות התצוגה</li>
        </ul>
        {snapshot ? (
          <p className="mt-3 text-xs text-slate-500">
            כרגע שמורות {snapshot.transactions.length} עסקאות ו-{snapshot.categories.length}{' '}
            קטגוריות.
          </p>
        ) : null}
      </Card>

      <Card>
        <CardTitle>מה לא נשמר — ולא ייווצר</CardTitle>
        <ul className="list-inside list-disc space-y-1.5 text-sm leading-relaxed text-slate-700">
          <li>שם, אימייל, טלפון או כתובת</li>
          <li>סיסמה לבנק, שם משתמש או קוד אימות</li>
          <li>מספר חשבון, מספר כרטיס אשראי, תעודת זהות או IBAN</li>
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          למערכת אין שדות כאלה בכלל. יש בדיקה אוטומטית שנכשלת אם מישהו מנסה להוסיף אותם.
        </p>
      </Card>

      <Card tone="caution">
        <CardTitle icon="alert-triangle">מה שחשוב שתדע</CardTitle>
        <p className="text-sm leading-relaxed text-slate-700">
          האחסון של הדפדפן <strong>אינו מוצפן</strong>. מי שיש לו גישה למכשיר לא-נעול יכול, עם קצת
          ידע, לקרוא את הנתונים.
        </p>
        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-800">
          ההגנה האמיתית היא נעילת המסך של הטלפון.
        </p>
      </Card>

      <Card>
        <CardTitle>קוד הנעילה של האפליקציה</CardTitle>
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
        <CardTitle>קובץ הגיבוי</CardTitle>
        <p className="text-sm leading-relaxed text-slate-700">
          הגיבוי הוא הדבר היחיד שיכול לעזוב את המכשיר — ורק אם אתה בוחר לשמור אותו במקום אחר, כמו
          Drive או אימייל. שם הוא כבר לא מוגן על ידי המכשיר שלך.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          לכן אפשר להצפין אותו בסיסמה. הסיסמה לא נשמרת בשום מקום — בלעדיה גם אנחנו לא נוכל לפתוח
          את הקובץ.
        </p>
      </Card>

      <Card>
        <CardTitle>חיבור לבנק</CardTitle>
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
        <CardTitle>זו לא ייעוץ פיננסי</CardTitle>
        <p className="text-sm leading-relaxed text-slate-700">
          המערכת מחשבת ומציגה את הנתונים שלך. היא לא מציעה השקעות, אשראי או הלוואות, וכל תחזית בה
          היא תרחיש לפי מה שהוזן — לא הבטחה.
        </p>
      </Card>

      <Link to="/settings" className="block py-3 pb-6 text-center text-sm font-semibold text-accent">
        ← חזרה להגדרות
      </Link>
    </Page>
  );
}
