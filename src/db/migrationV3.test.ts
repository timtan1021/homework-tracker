import { deleteDB, openDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";
import { DB_NAME, DB_VERSION, getDb, resetDbForTests } from "./schema";

afterEach(async () => {
  await resetDbForTests();
  await deleteDB(DB_NAME);
});

/** ステップ2時点（バージョン2）のDBを作り、生徒と提出物を1件ずつ入れる。 */
async function seedVersion2(): Promise<{
  cohortId: string;
  studentId: string;
  typeId: string;
}> {
  const cohortId = "cohort-v2";
  const studentId = "student-v2";
  const typeId = "type-v2";

  const db = await openDB(DB_NAME, 2, {
    upgrade(database) {
      const cohorts = database.createObjectStore("cohorts", { keyPath: "id" });
      cohorts.createIndex("by-year", "year");

      const students = database.createObjectStore("students", { keyPath: "id" });
      students.createIndex("by-cohort", "cohortId");
      students.createIndex("by-cohort-number", ["cohortId", "attendanceNumber"], {
        unique: true,
      });

      database.createObjectStore("settings", { keyPath: "key" });

      const types = database.createObjectStore("submissionTypes", {
        keyPath: "id",
      });
      types.createIndex("by-cohort", "cohortId");
    },
  });

  await db.put("cohorts", {
    id: cohortId,
    year: 2026,
    className: "5年1組",
    isActive: true,
    createdAt: 1,
  });
  await db.put("students", {
    id: studentId,
    cohortId,
    attendanceNumber: 12,
    name: "やまだ",
    status: "active",
    createdAt: 1,
  });
  await db.put("submissionTypes", {
    id: typeId,
    cohortId,
    name: "計算ドリル",
    deadline: "08:15",
    weekdays: [1, 2, 3, 4, 5],
    status: "active",
    order: 1,
    createdAt: 1,
  });

  db.close();
  return { cohortId, studentId, typeId };
}

describe("バージョン2からバージョン3への移行", () => {
  it("生徒が残る", async () => {
    const { studentId } = await seedVersion2();

    const db = await getDb();
    const student = await db.get("students", studentId);

    expect(student?.attendanceNumber).toBe(12);
  });

  it("提出物が残る", async () => {
    const { typeId } = await seedVersion2();

    const db = await getDb();
    const type = await db.get("submissionTypes", typeId);

    expect(type?.name).toBe("計算ドリル");
    expect(type?.weekdays).toEqual([1, 2, 3, 4, 5]);
  });

  it("既存のインデックスが使える", async () => {
    const { cohortId } = await seedVersion2();

    const db = await getDb();
    const types = await db.getAllFromIndex(
      "submissionTypes",
      "by-cohort",
      cohortId,
    );

    expect(types).toHaveLength(1);
  });

  it("submissions ストアが追加される", async () => {
    await seedVersion2();

    const db = await getDb();

    expect(db.objectStoreNames.contains("submissions")).toBe(true);
  });

  it("submissions に2つのインデックスが張られる", async () => {
    await seedVersion2();

    const db = await getDb();
    const names = db.transaction("submissions").store.indexNames;

    expect(names.contains("by-cohort-date")).toBe(true);
    expect(names.contains("by-unique")).toBe(true);
  });

  it("by-unique が二重登録を弾く", async () => {
    const { cohortId, studentId, typeId } = await seedVersion2();

    const db = await getDb();
    const row = {
      cohortId,
      studentId,
      submissionTypeId: typeId,
      date: "2026-08-24",
      submittedAt: 1,
    };

    await db.put("submissions", { ...row, id: "a" });

    // 同じ日・同じ生徒・同じ提出物は二度入らない
    await expect(db.put("submissions", { ...row, id: "b" })).rejects.toThrow();
  });
});

describe("まっさらな端末でのバージョン3", () => {
  it("5つのストアがすべて作られる", async () => {
    const db = await getDb();

    // as const を付けないと string に広がり、contains の引数型に合わない
    for (const name of [
      "cohorts",
      "students",
      "settings",
      "submissionTypes",
      "submissions",
    ] as const) {
      expect(db.objectStoreNames.contains(name)).toBe(true);
    }
  });

  it("バージョンが3である", async () => {
    expect(DB_VERSION).toBe(3);

    const db = await getDb();
    expect(db.version).toBe(3);
  });
});
