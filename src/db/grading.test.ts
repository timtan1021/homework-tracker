import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { createCohort } from "./cohorts";
import { addStudent, transferOutStudent } from "./students";
import { addSubmissionType } from "./submissionTypes";
import { markAbsent, recordSubmission } from "./submissions";
import { clearGrade, gradeSubmission, listGradingItems } from "./grading";

useFreshDb();

let cohortId = "";
let typeId = "";
let studentId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;

  const type = await addSubmissionType({
    cohortId,
    name: "計算ドリル",
    deadline: "08:15",
    weekdays: [1, 2, 3, 4, 5],
  });
  typeId = type.id;

  const student = await addStudent({ cohortId, attendanceNumber: 5 });
  studentId = student.id;
});

function submit(date: string) {
  return recordSubmission({
    cohortId,
    studentId,
    submissionTypeIds: [typeId],
    date,
  });
}

describe("listGradingItems", () => {
  it("提出済みで未採点の記録を返す", async () => {
    await submit("2026-08-24");

    const { ungraded, resubmitPending } = await listGradingItems(cohortId);

    expect(ungraded).toHaveLength(1);
    expect(ungraded[0].student.attendanceNumber).toBe(5);
    expect(ungraded[0].type.name).toBe("計算ドリル");
    expect(resubmitPending).toHaveLength(0);
  });

  it("日付を問わず全期間の記録を返す", async () => {
    await submit("2026-01-01");
    await submit("2026-12-31");

    const { ungraded } = await listGradingItems(cohortId);

    expect(ungraded).toHaveLength(2);
  });

  it("欠席の記録は含めない", async () => {
    await markAbsent({
      cohortId,
      studentId,
      submissionTypeId: typeId,
      date: "2026-08-24",
    });

    const { ungraded } = await listGradingItems(cohortId);

    expect(ungraded).toHaveLength(0);
  });

  it("転出した生徒の記録は含めない", async () => {
    await submit("2026-08-24");
    await transferOutStudent(studentId);

    const { ungraded } = await listGradingItems(cohortId);

    expect(ungraded).toHaveLength(0);
  });

  it("gradeがpassedの記録はungradedにもresubmitPendingにも含めない", async () => {
    await submit("2026-08-24");
    const before = await listGradingItems(cohortId);
    await gradeSubmission(before.ungraded[0].submission.id, "passed");

    const { ungraded, resubmitPending } = await listGradingItems(cohortId);

    expect(ungraded).toHaveLength(0);
    expect(resubmitPending).toHaveLength(0);
  });

  it("gradeがresubmitの記録はresubmitPendingに入る", async () => {
    await submit("2026-08-24");
    const before = await listGradingItems(cohortId);
    await gradeSubmission(before.ungraded[0].submission.id, "resubmit");

    const { ungraded, resubmitPending } = await listGradingItems(cohortId);

    expect(ungraded).toHaveLength(0);
    expect(resubmitPending).toHaveLength(1);
    expect(resubmitPending[0].submission.grade).toBe("resubmit");
  });

  it("日付→出席番号の順で並ぶ", async () => {
    const other = await addStudent({ cohortId, attendanceNumber: 2 });
    await recordSubmission({
      cohortId,
      studentId: other.id,
      submissionTypeIds: [typeId],
      date: "2026-08-24",
    });
    await submit("2026-08-23");

    const { ungraded } = await listGradingItems(cohortId);

    expect(ungraded.map((item) => item.submission.date)).toEqual([
      "2026-08-23",
      "2026-08-24",
    ]);
  });
});

describe("gradeSubmission", () => {
  it("採点結果を保存する", async () => {
    await submit("2026-08-24");
    const before = await listGradingItems(cohortId);

    await gradeSubmission(before.ungraded[0].submission.id, "passed");

    const after = await listGradingItems(cohortId);
    expect(after.ungraded).toHaveLength(0);
  });

  it("採点結果を変更できる", async () => {
    await submit("2026-08-24");
    const before = await listGradingItems(cohortId);
    const id = before.ungraded[0].submission.id;

    await gradeSubmission(id, "resubmit");
    await gradeSubmission(id, "passed");

    const { resubmitPending } = await listGradingItems(cohortId);
    expect(resubmitPending).toHaveLength(0);
  });
});

describe("clearGrade", () => {
  it("未採点に戻す", async () => {
    await submit("2026-08-24");
    const before = await listGradingItems(cohortId);
    const id = before.ungraded[0].submission.id;
    await gradeSubmission(id, "resubmit");

    await clearGrade(id);

    const { ungraded, resubmitPending } = await listGradingItems(cohortId);
    expect(ungraded).toHaveLength(1);
    expect(resubmitPending).toHaveLength(0);
  });
});
