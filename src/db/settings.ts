import { ValidationError } from "./errors";
import { getDb } from "./schema";

export const SETTING_DEFAULTS = {
  /** 名簿と印刷シートに氏名を表示するか */
  showStudentNames: false,
  /** 名簿画面の初回案内を閉じたか */
  rosterHintDismissed: false,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting(key: SettingKey): Promise<boolean> {
  const db = await getDb();
  const row = await db.get("settings", key);
  return row === undefined ? SETTING_DEFAULTS[key] : row.value === true;
}

export async function setSetting(key: SettingKey, value: boolean): Promise<void> {
  const db = await getDb();
  await db.put("settings", { key, value });
}

const DEFAULT_DEADLINE_KEY = "dateSubmissionDefaultDeadline";
const DEFAULT_DEADLINE_FALLBACK = "08:15";

/** "HH:mm" のみ受け付ける。input type="time" の値がこの形式。 */
function isValidDeadline(deadline: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(deadline);
}

export async function getDefaultDeadline(): Promise<string> {
  const db = await getDb();
  const row = await db.get("settings", DEFAULT_DEADLINE_KEY);
  return typeof row?.value === "string" && isValidDeadline(row.value)
    ? row.value
    : DEFAULT_DEADLINE_FALLBACK;
}

export async function setDefaultDeadline(deadline: string): Promise<void> {
  if (!isValidDeadline(deadline)) {
    throw new ValidationError("締切時刻を入力してください");
  }
  const db = await getDb();
  await db.put("settings", { key: DEFAULT_DEADLINE_KEY, value: deadline });
}
