import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@core': r('./src/core'),
      '@data': r('./src/data'),
      '@ui': r('./src/ui'),
      '@content': r('./src/content'),
      '@dev': r('./src/dev'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/**/*.test.ts', 'src/tests/**/*.test.tsx'],
    // בדיקות ממשק (שלב 2) יריצו ב-jsdom דרך `test.projects`. מנוע החישוב
    // הוא TypeScript טהור ולא זקוק ל-DOM כלל.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      // המנוע הפיננסי חייב כיסוי מלא — כל מספר שמוצג למשתמש מחושב כאן
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/types.ts'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 95,
        statements: 100,
      },
    },
  },
});
