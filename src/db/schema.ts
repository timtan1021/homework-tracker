import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { StorageUnavailableError } from "./errors";

export type Cohort = {
  id: string;
  year: number;
  className: string;
  isActive: boolean;
  createdAt: number;
};

export type StudentStatus = "active" | "transferredOut";

export type Student = {
  id: string;
  cohortId: string;
  /** 出席番号。cohort内で status に関わらず一意。 */
  attendanceNumber: number;
  /** 氏名。未入力なら空文字。 */
  name: string;
  status: StudentStatus;
  createdAt: number;
};

export type Setting = { key: string; value: unknown };

export type SubmissionStatus = "active" | "ended";

export type SubmissionType = {
  id: string;
  cohortId: string;
  /** 提出物名。先生が入力したそのままを保持する（比較時のみ正規化する）。 */
  name: string;
  /** "HH:mm" 24時間表記。例: "08:15"。Dateだと日付が付いて「毎日この時刻」を表せない。 */
  deadline: string;
  /** 0=日曜 〜 6=土曜。Date.getDay() と同じ番号。昇順・重複なしで保存する。 */
  weekdays: number[];
  status: SubmissionStatus;
  /** 表示順。小さいほど上。 */
  order: number;
  createdAt: number;
};

export type Submission = {
  id: string;
  cohortId: string;
  studentId: string;
  submissionTypeId: string;
  /** "YYYY-MM-DD" ローカル日付。Dateだとタイムゾーンや時分で同日判定が壊れる。 */
  date: string;
  /** epoch ms。最初に提出した時刻。二度目のスキャンで上書きしない。 */
  submittedAt: number;
};

export interface HomeworkDB extends DBSchema {
  cohorts: {
    key: string;
    value: Cohort;
    indexes: { "by-year": number };
  };
  students: {
    key: string;
    value: Student;
    indexes: {
      "by-cohort": string;
      "by-cohort-number": [string, number];
    };
  };
  settings: {
    key: string;
    value: Setting;
  };
  submissionTypes: {
    key: string;
    value: SubmissionType;
    indexes: { "by-cohort": string };
  };
  submissions: {
    key: string;
    value: Submission;
    indexes: {
      "by-cohort-date": [string, string];
      "by-unique": [string, string, string];
    };
  };
}

export const DB_NAME = "homework-tracker";
export const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase<HomeworkDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<HomeworkDB>> {
  if (dbPromise === null) {
    if (typeof indexedDB === "undefined") {
      return Promise.reject(new StorageUnavailableError());
    }

    dbPromise = openDB<HomeworkDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // oldVersion で分岐する。まとめて作ると、既にストアがある端末で
        // createObjectStore が例外を投げ、名簿ごと開けなくなる。
        if (oldVersion < 1) {
          const cohorts = db.createObjectStore("cohorts", { keyPath: "id" });
          cohorts.createIndex("by-year", "year");

          const students = db.createObjectStore("students", { keyPath: "id" });
          students.createIndex("by-cohort", "cohortId");
          students.createIndex(
            "by-cohort-number",
            ["cohortId", "attendanceNumber"],
            { unique: true },
          );

          db.createObjectStore("settings", { keyPath: "key" });
        }

        if (oldVersion < 2) {
          const submissionTypes = db.createObjectStore("submissionTypes", {
            keyPath: "id",
          });
          submissionTypes.createIndex("by-cohort", "cohortId");
        }

        if (oldVersion < 3) {
          const submissions = db.createObjectStore("submissions", {
            keyPath: "id",
          });
          submissions.createIndex("by-cohort-date", ["cohortId", "date"]);
          // 二重記録の最後の砦。アプリのロジックだけに任せると
          // カメラの連写や二重タップで抜ける。
          submissions.createIndex(
            "by-unique",
            ["date", "studentId", "submissionTypeId"],
            { unique: true },
          );
        }
      },
    }).catch((): never => {
      // 次の呼び出しで開き直せるようにする
      dbPromise = null;
      throw new StorageUnavailableError();
    });
  }

  return dbPromise;
}

/** テスト専用。開いている接続を閉じてキャッシュを捨てる。 */
export async function resetDbForTests(): Promise<void> {
  if (dbPromise === null) {
    return;
  }
  const db = await dbPromise.catch(() => null);
  db?.close();
  dbPromise = null;
}
