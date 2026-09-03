import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { getDb } from "./schema";
import { createCohort } from "./cohorts";
import { addStudent, transferOutStudent } from "./students";
import { addSubmissionType } from "./submissionTypes";
import { markAbsent, recordSubmission } from "./submissions";
import { clearGrade, gradeSubmission, listGradingItems } from "./grading";
import { newId } from "../lib/id";
import { toDateKey } from "../lib/date";

useFreshDb();

const TODAY = toDateKey(new Date());

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

/**
 * date を提出日、submittedAt を受け取った時刻とする未採点の記録を直接
 * 書き込む。recordSubmission は submittedAt を常に Date.now() にするため、
 * 受け取った日をずらすテストにはこちらを使う。
 */
async function putUngraded(date: string, submittedAt: number): Promise<void> {
  const db = await getDb();
  await db.put("submissions", {
    id: newId(),
    cohortId,
    studentId,
    submissionTypeId: typeId,
    date,
    submittedAt,
    status: "submitted",
  });
}

describe("listGradingItems", () => {
  it("提出済みで未採点の記録を返す", async () => {
    await submit("2026-08-24");

    const { ungraded, resubmitPending } = await listGradingItems(
      cohortId,
      TODAY,
    );

    expect(ungraded).toHaveLength(1);
    expect(ungraded[0].student.attendanceNumber).toBe(5);
    expect(ungraded[0].type.name).toBe("計算ドリル");
    expect(resubmitPending).toHaveLength(0);
  });

  it("提出日を問わず、受け取った日(今日)の記録を返す", async () => {
    await submit("2026-01-01");
    await submit("2026-12-31");

    const { ungraded } = await listGradingItems(cohortId, TODAY);

    expect(ungraded).toHaveLength(2);
  });

  it("受け取った日で絞る。他の日に受け取った記録は含めない", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await putUngraded(TODAY, Date.now());
    await putUngraded(toDateKey(yesterday), yesterday.getTime());

    const { ungraded } = await listGradingItems(cohortId, TODAY);

    expect(ungraded).toHaveLength(1);
  });

  it("欠席の記録は含めない", async () => {
    await markAbsent({
      cohortId,
      studentId,
      submissionTypeId: typeId,
      date: "2026-08-24",
    });

    const { ungraded } = await listGradingItems(cohortId, TODAY);

    expect(ungraded).toHaveLength(0);
  });

  it("転出した生徒の記録は含めない", async () => {
    await submit("2026-08-24");
    await transferOutStudent(studentId);

    const { ungraded } = await listGradingItems(cohortId, TODAY);

    expect(ungraded).toHaveLength(0);
  });

  it("gradeがpassedの記録はungradedにもresubmitPendingにも含めない", async () => {
    await submit("2026-08-24");
    const before = await listGradingItems(cohortId, TODAY);
    await gradeSubmission(before.ungraded[0].submission.id, "passed");

    const { ungraded, resubmitPending } = await listGradingItems(
      cohortId,
      TODAY,
    );

    expect(ungraded).toHaveLength(0);
    expect(resubmitPending).toHaveLength(0);
  });

  it("gradeがresubmitの記録はresubmitPendingに入る", async () => {
    await submit("2026-08-24");
    const before = await listGradingItems(cohortId, TODAY);
    await gradeSubmission(before.ungraded[0].submission.id, "resubmit");

    const { ungraded, resubmitPending } = await listGradingItems(
      cohortId,
      TODAY,
    );

    expect(ungraded).toHaveLength(0);
    expect(resubmitPending).toHaveLength(1);
    expect(resubmitPending[0].submission.grade).toBe("resubmit");
  });

  it("再提出待ちは受け取った日で絞らない", async () => {
    await putUngraded("2026-01-01", Date.now());
    const before = await listGradingItems(cohortId, TODAY);
    await gradeSubmission(before.ungraded[0].submission.id, "resubmit");

    // 別の日を指定しても、再提出待ちには同じ記録が出続ける
    const otherDay = toDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const { resubmitPending } = await listGradingItems(cohortId, otherDay);

    expect(resubmitPending).toHaveLength(1);
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

    const { ungraded } = await listGradingItems(cohortId, TODAY);

    expect(ungraded.map((item) => item.submission.date)).toEqual([
      "2026-08-23",
      "2026-08-24",
    ]);
  });

  it("他の日に未採点があれば件数と一番古い受け取り日を返す", async () => {
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await putUngraded(toDateKey(oneDayAgo), oneDayAgo.getTime());
    await putUngraded(toDateKey(twoDaysAgo), twoDaysAgo.getTime());

    const { otherDaysUngradedCount, oldestUngradedDate } =
      await listGradingItems(cohortId, TODAY);

    expect(otherDaysUngradedCount).toBe(2);
    expect(oldestUngradedDate).toBe(toDateKey(twoDaysAgo));
  });

  it("他の日に未採点が無ければ件数は0、一番古い日はnull", async () => {
    await submit("2026-08-24"); // 今日受け取った分

    const { otherDaysUngradedCount, oldestUngradedDate } =
      await listGradingItems(cohortId, TODAY);

    expect(otherDaysUngradedCount).toBe(0);
    expect(oldestUngradedDate).toBeNull();
  });
});

describe("gradeSubmission", () => {
  it("採点結果を保存する", async () => {
    await submit("2026-08-24");
    const before = await listGradingItems(cohortId, TODAY);

    await gradeSubmission(before.ungraded[0].submission.id, "passed");

    const after = await listGradingItems(cohortId, TODAY);
    expect(after.ungraded).toHaveLength(0);
  });

  it("採点結果を変更できる", async () => {
    await submit("2026-08-24");
    const before = await listGradingItems(cohortId, TODAY);
    const id = before.ungraded[0].submission.id;

    await gradeSubmission(id, "resubmit");
    await gradeSubmission(id, "passed");

    const { resubmitPending } = await listGradingItems(cohortId, TODAY);
    expect(resubmitPending).toHaveLength(0);
  });
});

describe("clearGrade", () => {
  it("未採点に戻す", async () => {
    await submit("2026-08-24");
    const before = await listGradingItems(cohortId, TODAY);
    const id = before.ungraded[0].submission.id;
    await gradeSubmission(id, "resubmit");

    await clearGrade(id);

    const { ungraded, resubmitPending } = await listGradingItems(
      cohortId,
      TODAY,
    );
    expect(ungraded).toHaveLength(1);
    expect(resubmitPending).toHaveLength(0);
  });
});
