/**
 * הורדת קובץ למכשיר.
 *
 * ⚠️ `revokeObjectURL` נדחה בטיק אחד. ביטול מיידי אחרי `click()` הספיק
 * לפעמים לקרות **לפני** שהדפדפן התחיל לקרוא את ה-blob, והתוצאה הייתה
 * קובץ ריק — כישלון שקט שנראה בדיוק כמו הצלחה.
 */
export function downloadFile(content: string, fileName: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
