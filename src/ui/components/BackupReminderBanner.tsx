/**
 * תזכורת הגיבוי בלוח הבקרה.
 *
 * הכללים (מתי בכלל להציג, וכמה זמן שקט אחרי דחייה) יושבים ב-
 * `core/backupReminder.ts` כלוגיקה טהורה, כדי שאפשר יהיה לבדוק אותם
 * בלי לרנדר מסך.
 */

import { Link } from 'react-router-dom';
import { useAppData } from '../AppData';
import { db } from '../../data/db';
import { saveSettings } from '../../data/repositories';
import { backupReminder, dismissUntil } from '../../core/backupReminder';
import { Banner, buttonClass } from './ui';

export function BackupReminderBanner() {
  const { snapshot } = useAppData();
  if (!snapshot) return null;

  const state = backupReminder({
    today: snapshot.today,
    lastBackupDate: snapshot.lastBackupDate,
    dismissedUntil: snapshot.settings.backupReminderDismissedUntil ?? null,
    transactionCount: snapshot.transactions.length,
  });

  if (!state.show) return null;

  return (
    <Banner
      title={state.titleHe}
      body={state.bodyHe}
      action={
        <Link to="/backup" className={buttonClass()}>
          גיבוי עכשיו
        </Link>
      }
      onDismiss={() =>
        saveSettings(db, { backupReminderDismissedUntil: dismissUntil(snapshot.today) })
      }
    />
  );
}
