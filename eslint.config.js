import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'dev-dist', 'node_modules'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      eqeqeq: ['error', 'always'],
    },
  },

  // ------------------------------------------------------------------
  // כלל פרטיות: אסור להדפיס ללוג בשכבות שנוגעות בנתונים פיננסיים.
  // נאכף גם בבדיקה (src/tests/privacy.test.ts) כדי שלא יתאפשר לעקוף
  // אותו על ידי כיבוי ESLint.
  // ------------------------------------------------------------------
  {
    files: ['src/core/**/*.ts', 'src/data/**/*.ts', 'src/import/**/*.ts'],
    rules: {
      'no-console': 'error',
    },
  },

  // ------------------------------------------------------------------
  // core/ חייב להישאר טהור: בלי גישה ל-DOM, בלי אחסון, בלי שעון מובלע.
  // כל פונקציה מקבלת את "עכשיו" כפרמטר מפורש כדי שתהיה ניתנת לבדיקה.
  // ------------------------------------------------------------------
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'core/ חייב להישאר טהור — אין גישה ל-DOM' },
        { name: 'document', message: 'core/ חייב להישאר טהור — אין גישה ל-DOM' },
        { name: 'localStorage', message: 'core/ חייב להישאר טהור — אין אחסון' },
        { name: 'indexedDB', message: 'core/ חייב להישאר טהור — אין אחסון' },
        { name: 'fetch', message: 'core/ חייב להישאר טהור — אין רשת' },
      ],
    },
  },
);
