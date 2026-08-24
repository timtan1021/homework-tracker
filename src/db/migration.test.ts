import { deleteDB, openDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";
import { DB_NAME, DB_VERSION, getDb, resetDbForTests } from "./schema";

afterEach(async () => {
  await resetDbForTests();
  await deleteDB(DB_NAME);
});

/** ステップ1時点（バージョン1）のDBを作り、生徒を1人入れる。 */
async function seedVersion1(): Promise<{ cohortId: string; studentId: string }> {
  const cohortId = "cohort-v1";
  const studentId = "student-v1";

  const db = await openDB(DB_NAME, 1, {
    upgrade(database) {
      const cohorts = database.createObjectStore("cohorts", { keyPath: "id" });
      cohorts.createIndex("by-year", "year");

      const students = database.createObjectStore("students", { keyPath: "id" });
      students.createIndex("by-cohort", "cohortId");
      students.createIndex("by-cohort-number", ["cohortId", "attendanceNumber"], {
        unique: true,
      });

      database.createObjectStore("settings", { keyPath: "key" });
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
  await db.put("settings", { key: "showStudentNames", value: true });

  db.close();
  return { cohortId, studentId };
}

describe("バージョン1からバージョン2への移行", () => {
  it("クラスが残る", async () => {
    const { cohortId } = await seedVersion1();

    const db = await getDb();
    const cohort = await db.get("cohorts", cohortId);

    expect(cohort?.className).toBe("5年1組");
  });

  it("生徒が残る", async () => {
    const { studentId } = await seedVersion1();

    const db = await getDb();
    const student = await db.get("students", studentId);

    expect(student?.attendanceNumber).toBe(12);
    expect(student?.name).toBe("やまだ");
  });

  it("設定が残る", async () => {
    await seedVersion1();

    const db = await getDb();
    const row = await db.get("settings", "showStudentNames");

    expect(row?.value).toBe(true);
  });

  it("既存のインデックスが使える", async () => {
    const { cohortId } = await seedVersion1();

    const db = await getDb();
    const students = await db.getAllFromIndex("students", "by-cohort", cohortId);

    expect(students).toHaveLength(1);
  });

  it("submissionTypes ストアが追加される", async () => {
    await seedVersion1();

    const db = await getDb();

    expect(db.objectStoreNames.contains("submissionTypes")).toBe(true);
  });

  it("submissionTypes に by-cohort インデックスが張られる", async () => {
    await seedVersion1();

    const db = await getDb();
    const index = db
      .transaction("submissionTypes")
      .store.indexNames.contains("by-cohort");

    expect(index).toBe(true);
  });
});

describe("まっさらな端末でのバージョン2", () => {
  it("4つのストアがすべて作られる", async () => {
    const db = await getDb();

    expect(db.objectStoreNames.contains("cohorts")).toBe(true);
    expect(db.objectStoreNames.contains("students")).toBe(true);
    expect(db.objectStoreNames.contains("settings")).toBe(true);
    expect(db.objectStoreNames.contains("submissionTypes")).toBe(true);
  });

  it("バージョンが2である", async () => {
    expect(DB_VERSION).toBe(2);

    const db = await getDb();
    expect(db.version).toBe(2);
  });
});
