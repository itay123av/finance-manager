import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const pkg = JSON.parse(readFileSync(r('./package.json'), 'utf8')) as { version: string };

/**
 * מזהה בנייה קצר — לצורך debug בלבד.
 *
 * כשמשהו מתנהג מוזר, השאלה הראשונה היא "איזו גרסה בכלל רצה אצלך?".
 * במסך הגדרות זה מוצג ליד מספר הגרסה.
 */
const BUILD_ID = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

/**
 * נתיב הבסיס שממנו האפליקציה מוגשת.
 *
 * ⚠️ GitHub Pages מגיש מתת-נתיב — `https://<user>.github.io/<repo>/` —
 * ולא משורש הדומיין. בלי `base` נכון, כל נכס נטען מ-`/assets/...`
 * במקום מ-`/<repo>/assets/...`, והתוצאה היא מסך לבן עם 404 על הכל.
 *
 * נקבע מ-`BASE_PATH` כדי שאותו קוד יעבוד בשני המקרים: שורש דומיין
 * (Cloudflare/Netlify, וגם `npm run preview` מקומי) ותת-נתיב (Pages).
 */
const BASE = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base: BASE,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // ⚠️ `prompt` ולא `autoUpdate`. החלפת גרסה מתחת לידיים של המשתמש
      // באמצע הזנת עסקה מאבדת את מה שהקליד. עדכון הוא החלטה שלו.
      registerType: 'prompt',
      // הרישום מוזרק ל-index.html; ההודעה על עדכון מטופלת ב-UpdatePrompt
      // מול ה-API הגולמי, בלי מודול וירטואלי.
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'ניהול כספים',
        short_name: 'כספים',
        description: 'מערכת אישית לניהול כספים — הנתונים נשמרים רק במכשיר שלך',
        lang: 'he',
        dir: 'rtl',
        theme_color: '#14532d',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        // ⚠️ יחסיים לנתיב הבסיס, לא לשורש הדומיין. `start_url: '/'` על
        // GitHub Pages היה שולח את האפליקציה המותקנת לדף הבית של
        // github.io במקום לאפליקציה.
        start_url: BASE,
        scope: BASE,
        // ⚠️ הסמלים כאן חייבים להתקיים בפועל ב-public/. manifest שמצביע
        // על קובץ חסר לא נכשל ברעש — הוא פשוט הופך את האפליקציה ללא
        // ניתנת להתקנה, וזה מתגלה רק כשמנסים להוסיף למסך הבית.
        //
        // PNG ל-Android ול-iOS, ו-SVG כגודל "any" — הוא נשאר חד בכל
        // רזולוציה, כולל במסך הפתיחה ובסמל הממוסך.
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          // SVG כגודל "any" — נשאר חד בכל רזולוציה שאין לה PNG
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // אין קריאות רשת בזמן ריצה — הכל מוגש מה-cache
        runtimeCaching: [],
      },
    }),
  ],
  resolve: {
    alias: {
      '@core': r('./src/core'),
      '@data': r('./src/data'),
      '@ui': r('./src/ui'),
      '@content': r('./src/content'),
      '@dev': r('./src/dev'),
    },
  },
  build: {
    // אין source maps ב-production — מצמצם חשיפה אם האפליקציה מתארחת
    sourcemap: false,
    target: 'es2022',
  },
});
