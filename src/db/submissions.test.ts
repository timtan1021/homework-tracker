import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { createCohort } from "./cohorts";
import { addStudent, transferOutStudent } from "./students";
import { addSubmissionType } from "./submissionTypes";
import {
  countByType,
  listSubmissions,
  markAbsent,
  recordSubmission,
  unmarkAbsent,
} from "./submissions";

useFreshDb();

const DATE = "2026-08-24";

let cohortId = "";
let studentId = "";
let drillId = "";
let readingId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;

  const student = await addStudent({ cohortId, attendanceNumber: 12 });
  studentId = student.id;

  const drill = await addSubmissionType({
    cohortId,
    name: "計算ドリル",
    deadline: "08:15",
    weekdays: [1, 2, 3, 4, 5],
  });
  drillId = drill.id;

  const reading = await addSubmissionType({
    cohortId,
    name: "音読カード",
    deadline: "08:15",
    weekdays: [1, 2, 3, 4, 5],
  });
  readingId = reading.id;
});

function record(ids: string[] = [drillId], id = studentId) {
  return recordSubmission({
    cohortId,
    studentId: id,
    submissionTypeIds: ids,
    date: DATE,
  });
}

describe("recordSubmission", () => {
  it("提出を記録して recorded を返す", async () => {
    const result = await record();

    expect(result.kind).toBe("recorded");
    expect(result.kind === "recorded" && result.student.attendanceNumber).toBe(12);
    expect(await listSubmissions(cohortId, DATE)).toHaveLength(1);
  });

  it("複数の提出物にまとめて記録する", async () => {
    await record([drillId, readingId]);

    expect(await listSubmissions(cohortId, DATE)).toHaveLength(2);
  });

  it("二度目は already を返し記録を増やさない", async () => {
    await record();
    const result = await record();

    expect(result.kind).toBe("already");
    expect(await listSubmissions(cohortId, DATE)).toHaveLength(1);
  });

  it("二度目に提出時刻を上書きしない", async () => {
    await record();
    const first = (await listSubmissions(cohortId, DATE))[0].submittedAt;

    await record();
    const after = (await listSubmissions(cohortId, DATE))[0].submittedAt;

    // 締切前に出した生徒が、先生の再スキャンで遅刻扱いになってはならない
    expect(after).toBe(first);
  });

  it("一部だけ提出済みなら未記録のものだけ足して recorded を返す", async () => {
    await record([drillId]);
    const result = await record([drillId, readingId]);

    expect(result.kind).toBe("recorded");
    expect(await listSubmissions(cohortId, DATE)).toHaveLength(2);
  });

  it("日が変われば別の記録になる", async () => {
    await record();
    await recordSubmission({
      cohortId,
      studentId,
      submissionTypeIds: [drillId],
      date: "2026-08-25",
    });

    expect(await listSubmissions(cohortId, DATE)).toHaveLength(1);
    expect(await listSubmissions(cohortId, "2026-08-25")).toHaveLength(1);
  });

  it("転出した生徒は記録しない", async () => {
    await transferOutStudent(studentId);
    const result = await record();

    expect(result.kind).toBe("transferredOut");
    expect(await listSubmissions(cohortId, DATE)).toHaveLength(0);
  });

  it("居ない生徒は notFound を返す", async () => {
    const result = await record([drillId], "missing");

    expect(result.kind).toBe("notFound");
    expect(await listSubmissions(cohortId, DATE)).toHaveLength(0);
  });

  it("別のcohortの生徒は notFound を返す", async () => {
    const other = await createCohort({ year: 2025, className: "4年1組" });
    const stranger = await addStudent({
      cohortId: other.id,
      attendanceNumber: 1,
    });

    // createCohort が cohortId を差し替えるため、記録先は元のクラスを明示する
    const result = await recordSubmission({
      cohortId,
      studentId: stranger.id,
      submissionTypeIds: [drillId],
      date: DATE,
    });

    expect(result.kind).toBe("notFound");
  });

  it("提出物が空なら記録しない", async () => {
    const result = await record([]);

    expect(result.kind).toBe("already");
    expect(await listSubmissions(cohortId, DATE)).toHaveLength(0);
  });

  it("欠席の記録を提出に上書きする", async () => {
    await markAbsent({
      cohortId,
      studentId,
      submissionTypeId: drillId,
      date: DATE,
    });

    const result = await record();

    expect(result.kind).toBe("recorded");
    const submissions = await listSubmissions(cohortId, DATE);
    expect(submissions).toHaveLength(1);
    expect(submissions[0].status).toBe("submitted");
  });

  it("欠席から提出への上書きでレコードを複製しない", async () => {
    await markAbsent({
      cohortId,
      studentId,
      submissionTypeId: drillId,
      date: DATE,
    });
    const absentId = (await listSubmissions(cohortId, DATE))[0].id;

    await record();

    const submissions = await listSubmissions(cohortId, DATE);
    expect(submissions).toHaveLength(1);
    expect(submissions[0].id).toBe(absentId);
  });
});

describe("listSubmissions", () => {
  it("その日のものだけ返す", async () => {
    await record();
    await recordSubmission({
      cohortId,
      studentId,
      submissionTypeIds: [drillId],
      date: "2026-08-25",
    });

    expect(await listSubmissions(cohortId, DATE)).toHaveLength(1);
  });

  it("記録が無ければ空を返す", async () => {
    expect(await listSubmissions(cohortId, DATE)).toEqual([]);
  });
});

describe("countByType", () => {
  it("提出物ごとの人数を返す", async () => {
    const second = await addStudent({ cohortId, attendanceNumber: 13 });

    await record([drillId, readingId]);
    await record([drillId], second.id);

    const counts = await countByType(cohortId, DATE);

    expect(counts.get(drillId)).toBe(2);
    expect(counts.get(readingId)).toBe(1);
  });

  it("記録の無い提出物は含まない", async () => {
    await record([drillId]);

    const counts = await countByType(cohortId, DATE);

    expect(counts.has(readingId)).toBe(false);
  });
});

describe("markAbsent", () => {
  it("記録の無い生徒を欠席として記録する", async () => {
    const result = await markAbsent({
      cohortId,
      studentId,
      submissionTypeId: drillId,
      date: DATE,
    });

    expect(result.kind).toBe("marked");
    const submissions = await listSubmissions(cohortId, DATE);
    expect(submissions).toHaveLength(1);
    expect(submissions[0].status).toBe("absent");
  });

  it("既に記録がある生徒には書き込まずalreadyRecordedを返す", async () => {
    await record();

    const result = await markAbsent({
      cohortId,
      studentId,
      submissionTypeId: drillId,
      date: DATE,
    });

    expect(result.kind).toBe("alreadyRecorded");
    const submissions = await listSubmissions(cohortId, DATE);
    expect(submissions).toHaveLength(1);
    expect(submissions[0].status).toBe("submitted");
  });
});

describe("unmarkAbsent", () => {
  it("欠席の記録を削除する", async () => {
    await markAbsent({
      cohortId,
      studentId,
      submissionTypeId: drillId,
      date: DATE,
    });

    await unmarkAbsent({ studentId, submissionTypeId: drillId, date: DATE });

    expect(await listSubmissions(cohortId, DATE)).toHaveLength(0);
  });

  it("記録が無ければ何もしない", async () => {
    await unmarkAbsent({ studentId, submissionTypeId: drillId, date: DATE });

    expect(await listSubmissions(cohortId, DATE)).toHaveLength(0);
  });

  it("提出済みの記録は消さない", async () => {
    await record();

    await unmarkAbsent({ studentId, submissionTypeId: drillId, date: DATE });

    expect(await listSubmissions(cohortId, DATE)).toHaveLength(1);
  });
});
