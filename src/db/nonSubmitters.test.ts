import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { createCohort } from "./cohorts";
import { addStudent, transferOutStudent } from "./students";
import { addSubmissionType, endSubmissionType } from "./submissionTypes";
import { recordSubmission } from "./submissions";
import { listTodayNonSubmitters } from "./nonSubmitters";

useFreshDb();

// 2026-08-24 は月曜
const DATE = "2026-08-24";
const MONDAY = 1;
const SUNDAY = 0;

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

describe("listTodayNonSubmitters", () => {
  it("今日が提出日でない提出物は含まない", async () => {
    await addSubmissionType({
      cohortId,
      name: "週末だけの提出物",
      deadline: "08:15",
      weekdays: [SUNDAY],
    });

    const groups = await listTodayNonSubmitters(
      cohortId,
      DATE,
      new Date(2026, 7, 24, 7, 0),
    );

    expect(groups).toEqual([]);
  });

  it("終了した提出物は含まない", async () => {
    const type = await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [MONDAY],
    });
    await endSubmissionType(type.id);

    const groups = await listTodayNonSubmitters(
      cohortId,
      DATE,
      new Date(2026, 7, 24, 7, 0),
    );

    expect(groups).toEqual([]);
  });

  it("記録の無い在籍生徒だけを出席番号順で返す", async () => {
    const type = await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [MONDAY],
    });
    const s3 = await addStudent({ cohortId, attendanceNumber: 3 });
    await addStudent({ cohortId, attendanceNumber: 1 });
    await recordSubmission({
      cohortId,
      studentId: s3.id,
      submissionTypeIds: [type.id],
      date: DATE,
    });

    const groups = await listTodayNonSubmitters(
      cohortId,
      DATE,
      new Date(2026, 7, 24, 7, 0),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].students.map((s) => s.attendanceNumber)).toEqual([1]);
  });

  it("転出した生徒は含まない", async () => {
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [MONDAY],
    });
    const out = await addStudent({ cohortId, attendanceNumber: 9 });
    await transferOutStudent(out.id);

    const groups = await listTodayNonSubmitters(
      cohortId,
      DATE,
      new Date(2026, 7, 24, 7, 0),
    );

    expect(groups[0].students).toEqual([]);
  });

  it("全員提出済みならstudentsが空配列", async () => {
    const type = await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [MONDAY],
    });
    const student = await addStudent({ cohortId, attendanceNumber: 1 });
    await recordSubmission({
      cohortId,
      studentId: student.id,
      submissionTypeIds: [type.id],
      date: DATE,
    });

    const groups = await listTodayNonSubmitters(
      cohortId,
      DATE,
      new Date(2026, 7, 24, 7, 0),
    );

    expect(groups[0].students).toEqual([]);
  });

  it("締切前はdeadlinePassedがfalse", async () => {
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [MONDAY],
    });

    const groups = await listTodayNonSubmitters(
      cohortId,
      DATE,
      new Date(2026, 7, 24, 8, 0),
    );

    expect(groups[0].deadlinePassed).toBe(false);
  });

  it("締切後はdeadlinePassedがtrue", async () => {
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [MONDAY],
    });

    const groups = await listTodayNonSubmitters(
      cohortId,
      DATE,
      new Date(2026, 7, 24, 8, 30),
    );

    expect(groups[0].deadlinePassed).toBe(true);
  });
});
