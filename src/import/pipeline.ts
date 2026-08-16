/**
 * צנרת הייבוא.
 *
 * קובץ → טבלה → מיפוי → שורות → כיוון → כפילויות → סיווג → תצוגה מקדימה.
 *
 * הפונקציה כאן **לא כותבת דבר** לבסיס הנתונים. היא מייצרת תצוגה
 * מקדימה שאפשר להסתכל עליה, לשנות בה, או לזרוק. הכתיבה קורית רק
 * ב-`commitImport`, אחרי אישור מפורש — ורק אם `blockedReason` הוא `null`.
 */

import { readTable } from './tabular';
import { detectMapping, isMappingUsable } from './columnMapping';
import { parseRows } from './rows';
import { findDirectionCandidates, resolveDirection } from './direction';
import { classifyDuplicates } from './dedupe';
import { classifyMerchant, needsReview, type ClassifyContext } from './classify';
import { walkStatement } from '../core/reconcile';
import { detectStatementKind, redactAccountNumbers } from './statementKind';
import { IGNORED_PATTERNS } from '../content/merchantRules.seed';
import {
  ImportError,
  MAX_FILE_BYTES,
  type ClassifiedRow,
  type ColumnMapping,
  type DirectionRule,
  type ImportPreview,
  type SourceFile,
} from './types';
import type { Transaction, UUID } from '../core/types';

export interface BuildPreviewInput {
  file: SourceFile;
  accountId: UUID;
  existing: readonly Transaction[];
  context: ClassifyContext;
  /** מיפוי שנשמר מייבוא קודם, או תיקון ידני של המשתמש. */
  mappingOverride?: ColumnMapping;
  /** כלל הכיוון שהמשתמש בחר, כשהקובץ לא מספיק ברור בעצמו. */
  directionRule?: DirectionRule;
}

export function buildImportPreview(input: BuildPreviewInput): ImportPreview {
  const { file, accountId, existing, context } = input;
  const directionRule: DirectionRule = input.directionRule ?? { kind: 'auto' };

  if (file.bytes.length > MAX_FILE_BYTES) {
    throw new ImportError(
      `הקובץ גדול מ-${MAX_FILE_BYTES / 1024 / 1024}MB. אפשר לייצא טווח תאריכים קצר יותר.`,
      'too_large',
    );
  }

  const table = readTable(file);
  const mapping = input.mappingOverride ?? detectMapping(table.rows);

  if (!isMappingUsable(mapping)) {
    throw new ImportError(
      'לא זיהינו עמודת תאריך ועמודת סכום. אפשר להתאים את העמודות ידנית.',
      'no_columns',
    );
  }

  const parseResult = parseRows(table.rows, mapping, { directionRule });
  const headerRow =
    mapping.headerRowIndex === null ? null : (table.rows[mapping.headerRowIndex] ?? null);

  // ── סוג הדוח ────────────────────────────────────────────────────────
  const statementKind = detectStatementKind({
    headerCells: headerRow ?? [],
    hasBalanceColumn: mapping.roles.includes('balance'),
  });

  // ── כיוון ──────────────────────────────────────────────────────────
  const direction = resolveDirection({
    hasDebitCredit: parseResult.hasDebitCredit,
    sawNegativeAmount: parseResult.sawNegativeAmount,
    hasRows: parseResult.rows.length > 0,
    rule: directionRule,
    candidates: findDirectionCandidates(table.rows, mapping, headerRow),
  });

  // שורות טכניות של הבנק אינן עסקאות ואינן שגיאות — פשוט מסננים אותן
  const relevant = parseResult.rows.filter(
    (row) => !IGNORED_PATTERNS.some((pattern) => pattern.test(row.merchant)),
  );

  const verdicts = classifyDuplicates({ accountId, rows: relevant, existing });

  const rows: ClassifiedRow[] = relevant.map((row, index) => {
    const decision = verdicts[index]!;
    const classification = classifyMerchant(row.merchantNormalized, row.type, context);
    return {
      ...row,
      verdict: decision.verdict,
      ...(decision.reasonHe ? { duplicateReasonHe: decision.reasonHe } : {}),
      dedupeKey: decision.dedupeKey,
      categoryId: classification.categoryId,
      categoryConfidence: classification.confidence,
      classificationSourceHe: classification.sourceHe,
      // כפילות מדויקת לא מסומנת; חשד מטושטש כן, כדי שהמחדל לא יאבד עסקה
      selected: decision.verdict !== 'exact_duplicate',
    };
  });

  const dates = rows.map((r) => r.date).sort();
  const dateRange = dates.length > 0 ? { from: dates[0]!, to: dates[dates.length - 1]! } : null;

  // ── יתרת פתיחה וסיום, מתוך עמודת היתרה ─────────────────────────────
  //
  // ⚠️ אסור להניח שהקובץ מסודר מהישן לחדש. בנקים ישראליים מייצאים לא
  // פעם מהחדש לישן, ואז "השורה האחרונה" היא דווקא העסקה הכי ישנה.
  // לקיחת היתרה משם הייתה מייצרת פער מדומה בכל התאמה.
  const withBalance = rows.filter((r) => r.statementBalanceAgorot !== undefined);
  const ledger =
    withBalance.length > 0
      ? walkStatement(
          withBalance.map((r) => ({
            date: r.date,
            signedAmountAgorot: r.type === 'income' ? r.amountAgorot : -r.amountAgorot,
            statementBalanceAgorot: r.statementBalanceAgorot!,
          })),
        )
      : null;

  return {
    fileName: file.name,
    format: table.format,
    encoding: table.encoding,
    // שם הגיליון מכיל לא פעם את מספר החשבון המלא — הוא מנוקה כאן,
    // לפני שהוא מגיע לממשק או לתיעוד הייבוא
    sheetName: table.sheetName === null ? null : redactAccountNumbers(table.sheetName),
    statementKind,
    mapping,
    direction,
    rows,
    failures: parseResult.failures,
    counts: {
      total: table.rows.length - (mapping.headerRowIndex === null ? 0 : mapping.headerRowIndex + 1),
      parsed: rows.length,
      income: rows.filter((r) => r.type === 'income').length,
      expense: rows.filter((r) => r.type === 'expense').length,
      fresh: rows.filter((r) => r.verdict === 'new').length,
      exactDuplicates: rows.filter((r) => r.verdict === 'exact_duplicate').length,
      possibleDuplicates: rows.filter((r) => r.verdict === 'possible_duplicate').length,
      failed: parseResult.failures.length,
      highConfidence: rows.filter((r) => !needsReview(r.categoryConfidence)).length,
      needsReview: rows.filter((r) => needsReview(r.categoryConfidence)).length,
    },
    dateRange,
    statementClosingBalanceAgorot: ledger?.closingBalanceAgorot ?? null,
    inferredOpeningBalanceAgorot: ledger?.inferredOpeningBalanceAgorot ?? null,
    inferredOpeningDate: ledger?.openingDate ?? null,
    ledgerConsistent: ledger?.consistent ?? false,
    // ⚠️ החסימות הן ההגנה:
    //  · בלי הכרעת כיוון, קליטה תשנה את היתרה לרעה.
    //  · פירוט כרטיס אשראי לחשבון בנק יספור כל רכישה פעמיים.
    blockedReason:
      statementKind.kind === 'credit_card'
        ? 'credit_card_file'
        : direction.confidence === 'unresolved'
          ? 'unresolved_direction'
          : null,
  };
}
