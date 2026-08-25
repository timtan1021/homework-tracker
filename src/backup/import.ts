import { getDb } from "../db/schema";
import { getActiveCohort } from "../db/cohorts";
import {
  BACKUP_FORMAT_VERSION,
  InvalidBackupError,
  type BackupFile,
} from "./types";

const CORRUPT_MESSAGE =
  "このファイルは読み込めませんでした。バックアップファイルを選び直してください";
const UNSUPPORTED_MESSAGE =
  "対応していない形式のバックアップです。最新版のアプリで書き出したファイルを使ってください";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * 生のテキストを BackupFile として検証する。
 *
 * 先生に内部構造の違いを説明しても意味がないため、形が不正な場合は
 * すべて同じ「対応していない形式」の案内にする。JSONとして壊れている
 * 場合だけ別の文言にする。
 */
export function parseBackup(raw: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new InvalidBackupError(CORRUPT_MESSAGE);
  }

  if (!isRecord(data)) {
    throw new InvalidBackupError(UNSUPPORTED_MESSAGE);
  }
  if (data.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new InvalidBackupError(UNSUPPORTED_MESSAGE);
  }
  if (!isRecord(data.cohort)) {
    throw new InvalidBackupError(UNSUPPORTED_MESSAGE);
  }
  if (!Array.isArray(data.students)) {
    throw new InvalidBackupError(UNSUPPORTED_MESSAGE);
  }
  if (!Array.isArray(data.submissionTypes)) {
    throw new InvalidBackupError(UNSUPPORTED_MESSAGE);
  }
  if (!Array.isArray(data.submissions)) {
    throw new InvalidBackupError(UNSUPPORTED_MESSAGE);
  }

  return data as BackupFile;
}

/**
 * 現在アクティブなcohortとその関連データを、バックアップの内容で
 * 完全に置き換える。IDは元のまま書き戻す。振り直すと生徒・提出物・
 * 提出記録の参照を作り直す必要が出るため。
 *
 * 無効化済みの他のcohortには触れない。
 */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  const db = await getDb();
  const current = await getActiveCohort();

  const tx = db.transaction(
    ["cohorts", "students", "submissionTypes", "submissions"],
    "readwrite",
  );

  if (current !== null) {
    const [students, types, submissions] = await Promise.all([
      tx.objectStore("students").index("by-cohort").getAllKeys(current.id),
      tx.objectStore("submissionTypes").index("by-cohort").getAllKeys(current.id),
      tx
        .objectStore("submissions")
        .index("by-cohort-date")
        .getAllKeys(IDBKeyRange.bound([current.id, ""], [current.id, "￿"])),
    ]);

    await Promise.all([
      tx.objectStore("cohorts").delete(current.id),
      ...students.map((id) => tx.objectStore("students").delete(id)),
      ...types.map((id) => tx.objectStore("submissionTypes").delete(id)),
      ...submissions.map((id) => tx.objectStore("submissions").delete(id)),
    ]);
  }

  await Promise.all([
    tx.objectStore("cohorts").put({ ...backup.cohort, isActive: true }),
    ...backup.students.map((student) =>
      tx.objectStore("students").put(student),
    ),
    ...backup.submissionTypes.map((type) =>
      tx.objectStore("submissionTypes").put(type),
    ),
    ...backup.submissions.map((submission) =>
      tx.objectStore("submissions").put(submission),
    ),
  ]);

  await tx.done;
}
