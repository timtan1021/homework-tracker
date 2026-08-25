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

/**
 * 対象日の締切を、現在時刻の時点で過ぎているか判定する。
 *
 * 過去の日付は常にtrue(どんな締切時刻でも既に過ぎている)。
 * 今日の日付は、現在時刻と締切時刻("HH:mm")を比較する。
 */
export function isPastDeadline(
  date: string,
  deadline: string,
  now: Date,
): boolean {
  const today = toDateKey(now);
  if (date < today) {
    return true;
  }
  if (date > today) {
    return false;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const [hours, minutes] = deadline.split(":").map(Number);
  return nowMinutes >= hours * 60 + minutes;
}

/**
 * "YYYY-MM-DD" の曜日を返す。
 *
 * new Date(dateKey) は文字列をUTCとして解釈するため、タイムゾーンによっては
 * 曜日がずれる。年月日を分解してローカル時刻で構築することでこれを避ける。
 */
export function weekdayOfDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

/** endDate を含む直近 days 日ぶんの日付キーを、古い順に返す。 */
export function recentDateKeys(endDate: string, days: number): string[] {
  const [year, month, day] = endDate.split("-").map(Number);
  const end = new Date(year, month - 1, day);

  return Array.from({ length: days }, (_, i) => {
    const current = new Date(end);
    current.setDate(current.getDate() - (days - 1 - i));
    return toDateKey(current);
  });
}
