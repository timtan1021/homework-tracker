import { describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { getDb } from "../db/schema";
import { createCohort, getActiveCohort } from "../db/cohorts";
import { addStudent } from "../db/students";
import { addSubmissionType } from "../db/submissionTypes";
import { recordSubmission } from "../db/submissions";
import { buildBackup } from "./export";
import type { BackupFile } from "./types";
import { parseBackup, restoreBackup } from "./import";
import { InvalidBackupError } from "./types";

useFreshDb();

describe("parseBackup", () => {
  it("正しい形式を読み取る", async () => {
    const cohort = await createCohort({ year: 2026, className: "5年1組" });
    const backup = await buildBackup(cohort.id);

    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.cohort.className).toBe("5年1組");
  });

  it("JSONとして壊れていれば拒否する", () => {
    expect(() => parseBackup("{ 壊れたJSON")).toThrow(
      new InvalidBackupError(
        "このファイルは読み込めませんでした。バックアップファイルを選び直してください",
      ),
    );
  });

  it("formatVersion が無ければ拒否する", () => {
    expect(() => parseBackup(JSON.stringify({ cohort: {} }))).toThrow(
      new InvalidBackupError(
        "対応していない形式のバックアップです。最新版のアプリで書き出したファイルを使ってください",
      ),
    );
  });

  it("formatVersion が未知の値なら拒否する", () => {
    // cohort: {} だけでは students 等の配列チェックが先に引っかかり、
    // formatVersion の検証を外しても偶然エラーになってしまう。
    // 他は正しい構造にして、formatVersion だけを不正にする。
    expect(() =>
      parseBackup(
        JSON.stringify({
          formatVersion: 99,
          exportedAt: new Date().toISOString(),
          cohort: {
            id: "x",
            year: 2026,
            className: "5年1組",
            isActive: true,
            createdAt: 1,
          },
          students: [],
          submissionTypes: [],
          submissions: [],
        }),
      ),
    ).toThrow(InvalidBackupError);
  });

  it("cohort が欠けていれば拒否する", () => {
    expect(() =>
      parseBackup(JSON.stringify({ formatVersion: 1, students: [] })),
    ).toThrow(InvalidBackupError);
  });

  it("students が配列でなければ拒否する", () => {
    expect(() =>
      parseBackup(
        JSON.stringify({ formatVersion: 1, cohort: {}, students: "x" }),
      ),
    ).toThrow(InvalidBackupError);
  });
});

describe("restoreBackup", () => {
  it("生徒・提出物・提出記録を書き戻す", async () => {
    const cohort = await createCohort({ year: 2026, className: "5年1組" });
    const student = await addStudent({ cohortId: cohort.id, attendanceNumber: 12 });
    const type = await addSubmissionType({
      cohortId: cohort.id,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [1, 2, 3, 4, 5],
    });
    await recordSubmission({
      cohortId: cohort.id,
      studentId: student.id,
      submissionTypeIds: [type.id],
      date: "2026-08-24",
    });
    const backup = await buildBackup(cohort.id);

    // すでに存在するデータの上に復元する。次の「完全に置き換える」テストで
    // 既存データが消えることを確認するので、ここでは復元後の内容だけを見る。
    await restoreBackup(backup);

    const active = await getActiveCohort();
    expect(active?.className).toBe("5年1組");

    const db = await getDb();
    const students = await db.getAllFromIndex(
      "students",
      "by-cohort",
      active!.id,
    );
    expect(students).toHaveLength(1);
    expect(students[0].attendanceNumber).toBe(12);
  });

  it("元のIDのまま復元する", async () => {
    const cohort = await createCohort({ year: 2026, className: "5年1組" });
    const student = await addStudent({ cohortId: cohort.id, attendanceNumber: 12 });
    const backup = await buildBackup(cohort.id);

    await restoreBackup(backup);

    const db = await getDb();
    const restored = await db.get("students", student.id);
    expect(restored?.id).toBe(student.id);
  });

  it("現在のデータを完全に置き換える", async () => {
    // createCohort を呼ぶとその場でアクティブになるため、復元用の
    // バックアップを別のcohortとして実際にDBへ作ってしまうと、
    // それ自体が「現在のデータ」になってしまい、置き換えの検証に
    // ならない。バックアップの中身は直接オブジェクトとして組み立てる。
    const original = await createCohort({ year: 2026, className: "5年1組" });
    await addStudent({ cohortId: original.id, attendanceNumber: 1 });
    await addStudent({ cohortId: original.id, attendanceNumber: 2 });

    const backup: BackupFile = {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      cohort: {
        id: "cohort-from-backup",
        year: 2025,
        className: "4年1組",
        isActive: true,
        createdAt: Date.now(),
      },
      students: [
        {
          id: "student-from-backup",
          cohortId: "cohort-from-backup",
          attendanceNumber: 99,
          name: "",
          status: "active",
          createdAt: Date.now(),
        },
      ],
      submissionTypes: [],
      submissions: [],
    };

    await restoreBackup(backup);

    const active = await getActiveCohort();
    expect(active?.className).toBe("4年1組");

    const db = await getDb();

    // 元の "5年1組" のcohort行そのものが消えていること。
    // 削除処理を無効化すると、ここが残ったままになる。
    expect(await db.get("cohorts", original.id)).toBeUndefined();

    const oldStudents = await db.getAllFromIndex(
      "students",
      "by-cohort",
      original.id,
    );
    expect(oldStudents).toHaveLength(0);

    const newStudents = await db.getAllFromIndex(
      "students",
      "by-cohort",
      active!.id,
    );
    expect(newStudents.map((s) => s.attendanceNumber)).toEqual([99]);
  });

  it("無効化済みの別クラスには触れない", async () => {
    const inactive = await createCohort({ year: 2024, className: "3年1組" });
    await addStudent({ cohortId: inactive.id, attendanceNumber: 5 });

    const active = await createCohort({ year: 2026, className: "5年1組" });
    const backup = await buildBackup(active.id);

    await restoreBackup(backup);

    const db = await getDb();
    const untouchedStudents = await db.getAllFromIndex(
      "students",
      "by-cohort",
      inactive.id,
    );
    expect(untouchedStudents).toHaveLength(1);
  });
});
