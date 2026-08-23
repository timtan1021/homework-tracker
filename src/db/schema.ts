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
}

export const DB_NAME = "homework-tracker";
export const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<HomeworkDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<HomeworkDB>> {
  if (dbPromise === null) {
    if (typeof indexedDB === "undefined") {
      return Promise.reject(new StorageUnavailableError());
    }

    dbPromise = openDB<HomeworkDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const cohorts = db.createObjectStore("cohorts", { keyPath: "id" });
        cohorts.createIndex("by-year", "year");

        const students = db.createObjectStore("students", { keyPath: "id" });
        students.createIndex("by-cohort", "cohortId");
        students.createIndex("by-cohort-number", ["cohortId", "attendanceNumber"], {
          unique: true,
        });

        db.createObjectStore("settings", { keyPath: "key" });
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
