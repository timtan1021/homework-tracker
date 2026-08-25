import { getDb } from "../db/schema";
import { toDateKey } from "../lib/date";
import { ValidationError } from "../db/errors";
import { BACKUP_FORMAT_VERSION, type BackupFile } from "./types";

export async function buildBackup(cohortId: string): Promise<BackupFile> {
  const db = await getDb();

  const cohort = await db.get("cohorts", cohortId);
  if (cohort === undefined) {
    throw new ValidationError("このクラスは見つかりません");
  }

  const [students, submissionTypes, submissions] = await Promise.all([
    db.getAllFromIndex("students", "by-cohort", cohortId),
    db.getAllFromIndex("submissionTypes", "by-cohort", cohortId),
    // submissions には by-cohort 単独のインデックスが無いため、
    // by-cohort-date の範囲検索でこのcohortの全日付を拾う。
    db.getAllFromIndex(
      "submissions",
      "by-cohort-date",
      IDBKeyRange.bound([cohortId, ""], [cohortId, "￿"]),
    ),
  ]);

  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    cohort,
    students,
    submissionTypes,
    submissions,
  };
}

/** 例: "宿題管理_バックアップ_20260825.json" */
export function backupFileName(date: Date = new Date()): string {
  return `宿題管理_バックアップ_${toDateKey(date).replaceAll("-", "")}.json`;
}
