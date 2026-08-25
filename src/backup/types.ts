import type { Cohort, Student, SubmissionType, Submission } from "../db/schema";

export const BACKUP_FORMAT_VERSION = 1;

export type BackupFile = {
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  /** 書き出した日時。ISO文字列。表示用で、復元の判断には使わない。 */
  exportedAt: string;
  cohort: Cohort;
  students: Student[];
  submissionTypes: SubmissionType[];
  submissions: Submission[];
};

/** 復元できないファイルを選んだときに投げる。message はそのまま画面に出す。 */
export class InvalidBackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBackupError";
  }
}
