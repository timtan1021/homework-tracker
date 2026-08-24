import { WEEKDAY_LABELS } from "./weekdays";

/**
 * "YYYY-MM-DD" をローカル時刻で作る。
 *
 * toISOString() を使ってはいけない。UTCへ変換されるため、
 * 日本時間の朝9時より前が前日になる。教室の日付が正しい日付である。
 */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 画面上部に出す日付。例: "8月24日(月)" */
export function formatDateHeading(date: Date): string {
  const weekday = WEEKDAY_LABELS[date.getDay()];
  return `${date.getMonth() + 1}月${date.getDate()}日(${weekday})`;
}
