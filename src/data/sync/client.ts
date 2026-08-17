/**
 * הצנרת מול Supabase: התחברות, העלאה והורדה של הבלוב.
 *
 * ⚠️ **הקובץ הזה לא מקבל החלטות.** מי מנצח נקבע ב-`core/syncDecision`,
 * ומה מוצפן נקבע ב-`sync/vault`. כאן רק רשת. ההפרדה הזו היא מה
 * שמאפשר לבדוק את ההיגיון המסוכן בלי שרת.
 *
 * ⚠️ הלקוח נבנה **בעצלתיים** (`getClient`). כך הקוד של Supabase לא
 * מתחיל להתחבר לרשת רק מפני שהמודול נטען — מי שלא הפעיל סנכרון
 * נשאר עם אפליקציה שלא מדברת עם אף אחד.
 */

import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, VAULT_TABLE } from './config';

export class SyncError extends Error {
  constructor(
    message: string,
    readonly reason: 'auth' | 'network' | 'server' | 'not_signed_in',
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

let client: SupabaseClient | null = null;

export function getClient(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // ⚠️ אין OAuth ואין redirect — הכתובת לא נושאת טוקנים.
      detectSessionInUrl: false,
    },
  });
  return client;
}

// ---------------------------------------------------------------------------
// התחברות
// ---------------------------------------------------------------------------

/**
 * ⚠️ הסיסמה כאן היא סיסמת **החשבון**, לא סיסמת ההצפנה.
 *
 * היא מגיעה ל-Supabase (כך עובד כל שירות התחברות). סיסמת ההצפנה
 * לעולם לא — היא לא עוזבת את המכשיר. זו הסיבה ששתיהן חייבות להיות
 * שונות, ומסך ההתחברות יאכוף זאת.
 */
export async function signIn(email: string, password: string): Promise<Session> {
  const { data, error } = await getClient().auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new SyncError(translateAuthError(error?.message), 'auth');
  }
  return data.session;
}

export async function signUp(email: string, password: string): Promise<Session | null> {
  const { data, error } = await getClient().auth.signUp({ email, password });
  if (error) throw new SyncError(translateAuthError(error.message), 'auth');
  // כשאימות אימייל פעיל אין session עד שהמשתמש מאשר את המייל.
  return data.session;
}

export async function signOut(): Promise<void> {
  await getClient().auth.signOut();
}

export async function currentSession(): Promise<Session | null> {
  const { data } = await getClient().auth.getSession();
  return data.session;
}

function translateAuthError(message: string | undefined): string {
  if (!message) return 'ההתחברות נכשלה';
  const lower = message.toLowerCase();
  if (lower.includes('invalid login')) return 'אימייל או סיסמה שגויים';
  if (lower.includes('already registered')) return 'כבר קיים חשבון עם האימייל הזה';
  if (lower.includes('password')) return 'הסיסמה קצרה מדי';
  if (lower.includes('email')) return 'כתובת האימייל אינה תקינה';
  // ⚠️ לא מחזירים את ההודעה הגולמית — היא עלולה לחשוף פרטי מימוש.
  return 'ההתחברות נכשלה';
}

// ---------------------------------------------------------------------------
// הבלוב
// ---------------------------------------------------------------------------

export interface RemoteVault {
  ciphertext: string;
  schemaVersion: number;
  updatedAt: string;
  deviceLabel: string | null;
}

/**
 * חותמת הזמן של הבלוב בענן, **בלי להוריד אותו**.
 *
 * ⚠️ זה מה שמאפשר לבדוק אם צריך לסנכרן בלי למשוך מגה־בייטים בכל
 * פתיחת אפליקציה — ובלי לפענח כלום.
 */
export async function fetchRemoteTimestamp(): Promise<string | null> {
  const userId = await requireUserId();
  const { data, error } = await getClient()
    .from(VAULT_TABLE)
    .select('updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw toSyncError(error);
  return (data?.updated_at as string | undefined) ?? null;
}

export async function fetchRemoteVault(): Promise<RemoteVault | null> {
  const userId = await requireUserId();
  const { data, error } = await getClient()
    .from(VAULT_TABLE)
    .select('ciphertext, schema_version, updated_at, device_label')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw toSyncError(error);
  if (!data) return null;

  return {
    ciphertext: data.ciphertext as string,
    schemaVersion: data.schema_version as number,
    updatedAt: data.updated_at as string,
    deviceLabel: (data.device_label as string | null) ?? null,
  };
}

export interface PushInput {
  ciphertext: string;
  schemaVersion: number;
  deviceLabel?: string;
}

/**
 * מעלה את הבלוב.
 *
 * ⚠️ `user_id` נכתב מתוך ה-session ולא מקלט — וגם אילו היה מזויף,
 * מדיניות ה-RLS במסד הייתה דוחה את הכתיבה. שתי שכבות, כי שכבה אחת
 * ברמת הלקוח אינה שכבה.
 */
export async function pushVault(input: PushInput): Promise<string> {
  const userId = await requireUserId();

  const { data, error } = await getClient()
    .from(VAULT_TABLE)
    .upsert(
      {
        user_id: userId,
        ciphertext: input.ciphertext,
        schema_version: input.schemaVersion,
        device_label: input.deviceLabel ?? null,
      },
      { onConflict: 'user_id' },
    )
    .select('updated_at')
    .single();

  if (error) throw toSyncError(error);
  return data.updated_at as string;
}

/** מוחק את העותק בענן. הנתונים במכשיר לא נוגעים. */
export async function deleteRemoteVault(): Promise<void> {
  const userId = await requireUserId();
  const { error } = await getClient().from(VAULT_TABLE).delete().eq('user_id', userId);
  if (error) throw toSyncError(error);
}

async function requireUserId(): Promise<string> {
  const session = await currentSession();
  if (!session) throw new SyncError('צריך להתחבר כדי לסנכרן', 'not_signed_in');
  return session.user.id;
}

/**
 * ⚠️ ההודעה למשתמש נבנית מקוד השגיאה, לא מהטקסט של השרת — טקסט שרת
 * עלול להכיל שם טבלה, שאילתה או ערך.
 */
function toSyncError(error: { code?: string; message?: string }): SyncError {
  if (error.code === '42501' || error.code === 'PGRST301') {
    return new SyncError('אין הרשאה לגשת לנתונים האלה', 'auth');
  }
  if (error.code === '23514') {
    return new SyncError('הנתונים גדולים מדי לסנכרון', 'server');
  }
  if (error.message?.includes('Failed to fetch')) {
    return new SyncError('אין חיבור לאינטרנט', 'network');
  }
  return new SyncError('הסנכרון נכשל. נסה שוב מאוחר יותר.', 'server');
}
