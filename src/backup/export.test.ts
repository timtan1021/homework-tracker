import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { createCohort } from "../db/cohorts";
import { addStudent, transferOutStudent } from "../db/students";
import { addSubmissionType } from "../db/submissionTypes";
import { recordSubmission } from "../db/submissions";
import { backupFileName, buildBackup } from "./export";
import { BACKUP_FORMAT_VERSION } from "./types";

useFreshDb();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

describe("buildBackup", () => {
  it("formatVersion を付ける", async () => {
    const backup = await buildBackup(cohortId);
    expect(backup.formatVersion).toBe(BACKUP_FORMAT_VERSION);
  });

  it("cohort を含める", async () => {
    const backup = await buildBackup(cohortId);
    expect(backup.cohort.className).toBe("5年1組");
  });

  it("生徒を含める。転出済みも含める", async () => {
    await addStudent({ cohortId, attendanceNumber: 1 });
    const out = await addStudent({ cohortId, attendanceNumber: 2 });
    await transferOutStudent(out.id);

    const backup = await buildBackup(cohortId);
    expect(backup.students).toHaveLength(2);
  });

  it("提出物を含める。終了済みも含める", async () => {
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [1, 2, 3, 4, 5],
    });

    const backup = await buildBackup(cohortId);
    expect(backup.submissionTypes).toHaveLength(1);
  });

  it("提出記録を含める", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 1 });
    const type = await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [1, 2, 3, 4, 5],
    });
    await recordSubmission({
      cohortId,
      studentId: student.id,
      submissionTypeIds: [type.id],
      date: "2026-08-24",
    });

    const backup = await buildBackup(cohortId);
    expect(backup.submissions).toHaveLength(1);
  });

  it("別のcohortのデータを含めない", async () => {
    const other = await createCohort({ year: 2025, className: "4年1組" });
    await addStudent({ cohortId: other.id, attendanceNumber: 1 });

    const backup = await buildBackup(cohortId);
    expect(backup.students).toHaveLength(0);
  });

  it("存在しないcohortIdなら拒否する", async () => {
    await expect(buildBackup("missing")).rejects.toThrow();
  });
});

describe("backupFileName", () => {
  it("年月日を含む", () => {
    expect(backupFileName(new Date(2026, 7, 25))).toBe(
      "宿題管理_バックアップ_20260825.json",
    );
  });

  it("月日を0埋めする", () => {
    expect(backupFileName(new Date(2026, 0, 5))).toBe(
      "宿題管理_バックアップ_20260105.json",
    );
  });
});
