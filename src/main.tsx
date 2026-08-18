import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@ui/App';
import { ensurePersistentStorage } from './data/persistence';
import './ui/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('לא נמצא אלמנט השורש');

/**
 * ⚠️ נקרא **לפני** הרינדור ובלי `await`.
 *
 * הבקשה לאחסון קבוע צריכה לצאת מוקדם ככל האפשר — לפני שהמשתמש
 * מספיק להזין נתונים שהדפדפן עלול למחוק. היא לא חוסמת את העלייה,
 * כי אפליקציה שלא נפתחת בגלל הרשאת אחסון גרועה מאחסון זמני.
 */
void ensurePersistentStorage();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
