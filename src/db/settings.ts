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
