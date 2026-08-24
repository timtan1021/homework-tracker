/** 0=日曜 〜 6=土曜。Date.getDay() と同じ並び。 */
export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** 一覧に出す曜日の表記。7つ揃っていれば「毎日」にする。 */
export function formatWeekdays(weekdays: number[]): string {
  if (weekdays.length === 0) {
    return "未設定";
  }
  if (weekdays.length === WEEKDAY_LABELS.length) {
    return "毎日";
  }

  return [...weekdays]
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_LABELS[day])
    .join("");
}
