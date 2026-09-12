import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { createCohort } from "./cohorts";
import { addDateSubmission } from "./dateSubmissions";
import { listDailyRoster } from "./dailyRoster";
import { getDb } from "./schema";
import { addStudent, transferOutStudent } from "./students";
import { addSubmissionType, endSubmissionType } from "./submissionTypes";
import { markAbsent, recordSubmission } from "./submissions";

useFreshDb();

// 2026-08-24 は月曜。曜日で提出日を決める提出物のテストに使う。
const MONDAY = "2026-08-24";
const NOON = new Date(2026, 7, 24, 12, 0);

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function drill(weekdays = [1, 2, 3, 4, 5]) {
  return addSubmissionType({
    cohortId,
    name: "計算ドリル",
    deadline: "08:15",
    weekdays,
  });
}

describe("listDailyRoster", () => {
  it("在籍生徒を出席番号順に行にし、転出は含めない", async () => {
    await drill();
    await addStudent({ cohortId, attendanceNumber: 12 });
    await addStudent({ cohortId, attendanceNumber: 3 });
    const out = await addStudent({ cohortId, attendanceNumber: 7 });
    await transferOutStudent(out.id);

    const roster = await listDailyRoster(cohortId, MONDAY, NOON);

    expect(roster.rows.map((row) => row.student.attendanceNumber)).toEqual([
      3, 12,
    ]);
    expect(roster.activeCount).toBe(2);
  });

  it("その日が提出日でない提出物と終了した提出物は列に出ない", async () => {
    await drill();
    await addSubmissionType({
      cohortId,
      name: "日曜だけ",
      deadline: "08:15",
      weekdays: [0],
    });
    const ended = await addSubmissionType({
      cohortId,
      name: "終わった提出物",
      deadline: "08:15",
      weekdays: [1],
    });
    await endSubmissionType(ended.id);

    const roster = await listDailyRoster(cohortId, MONDAY, NOON);

    expect(roster.columns.map((column) => column.type.name)).toEqual([
      "計算ドリル",
    ]);
  });

  it("提出済み・欠席・未記録をセルに反映し、提出人数を数える", async () => {
    const type = await drill();
    const a = await addStudent({ cohortId, attendanceNumber: 1 });
    const b = await addStudent({ cohortId, attendanceNumber: 2 });
    await addStudent({ cohortId, attendanceNumber: 3 });
    await recordSubmission({
      cohortId,
      studentId: a.id,
      submissionTypeIds: [type.id],
      date: MONDAY,
    });
    await markAbsent({
      cohortId,
      studentId: b.id,
      submissionTypeId: type.id,
      date: MONDAY,
    });

    const roster = await listDailyRoster(cohortId, MONDAY, NOON);

    expect(roster.rows.map((row) => row.cells[type.id])).toEqual([
      "submitted",
      "absent",
      "none",
    ]);
    expect(roster.columns[0].submittedCount).toBe(1);
  });

  it("status の無い旧レコードは提出済みとして扱う", async () => {
    const type = await drill();
    const student = await addStudent({ cohortId, attendanceNumber: 1 });
    const db = await getDb();
    await db.put("submissions", {
      id: "legacy",
      cohortId,
      studentId: student.id,
      submissionTypeId: type.id,
      date: MONDAY,
      submittedAt: NOON.getTime(),
    });

    const roster = await listDailyRoster(cohortId, MONDAY, NOON);

    expect(roster.rows[0].cells[type.id]).toBe("submitted");
  });

  it("締切前は deadlinePassed が false、過ぎれば true", async () => {
    await drill();

    const before = await listDailyRoster(
      cohortId,
      MONDAY,
      new Date(2026, 7, 24, 8, 0),
    );
    const after = await listDailyRoster(
      cohortId,
      MONDAY,
      new Date(2026, 7, 24, 8, 30),
    );

    expect(before.columns[0].deadlinePassed).toBe(false);
    expect(after.columns[0].deadlinePassed).toBe(true);
  });

  it("日付指定の提出物は対象日にだけ列に出る", async () => {
    await addDateSubmission({
      cohortId,
      name: "遠足のしおり",
      date: MONDAY,
      deadline: "08:15",
    });

    const onDay = await listDailyRoster(cohortId, MONDAY, NOON);
    const otherDay = await listDailyRoster(cohortId, "2026-08-25", NOON);

    expect(onDay.columns.map((column) => column.type.name)).toEqual([
      "遠足のしおり",
    ]);
    expect(otherDay.columns).toEqual([]);
  });

  it("提出物が無い日は列が空で、行は在籍生徒ぶん出る", async () => {
    await addStudent({ cohortId, attendanceNumber: 1 });

    const roster = await listDailyRoster(cohortId, MONDAY, NOON);

    expect(roster.columns).toEqual([]);
    expect(roster.rows).toHaveLength(1);
    expect(roster.rows[0].cells).toEqual({});
  });
});
