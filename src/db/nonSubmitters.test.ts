import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { recentDateKeys, toDateKey } from "../lib/date";
import { createCohort } from "./cohorts";
import { getDb } from "./schema";
import { addStudent, transferOutStudent } from "./students";
import { addSubmissionType, endSubmissionType } from "./submissionTypes";
import { addDateSubmission } from "./dateSubmissions";
import { markAbsent, recordSubmission } from "./submissions";
import {
  countRecentNonSubmissions,
  listTodayNonSubmitters,
} from "./nonSubmitters";

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
    expect(groups[0].students.map((s) => s.student.attendanceNumber)).toEqual([
      1,
    ]);
    expect(groups[0].students[0].status).toBe("unmarked");
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

  it("欠席とマークした生徒はabsent状態で一覧に残る", async () => {
    const type = await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [MONDAY],
    });
    const student = await addStudent({ cohortId, attendanceNumber: 5 });
    await markAbsent({
      cohortId,
      studentId: student.id,
      submissionTypeId: type.id,
      date: DATE,
    });

    const groups = await listTodayNonSubmitters(
      cohortId,
      DATE,
      new Date(2026, 7, 24, 7, 0),
    );

    expect(groups[0].students).toHaveLength(1);
    expect(groups[0].students[0].status).toBe("absent");
  });

  it("欠席と未マークが混在しても出席番号順を保つ", async () => {
    const type = await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [MONDAY],
    });
    const s1 = await addStudent({ cohortId, attendanceNumber: 1 });
    await addStudent({ cohortId, attendanceNumber: 2 });
    await markAbsent({
      cohortId,
      studentId: s1.id,
      submissionTypeId: type.id,
      date: DATE,
    });

    const groups = await listTodayNonSubmitters(
      cohortId,
      DATE,
      new Date(2026, 7, 24, 7, 0),
    );

    expect(groups[0].students.map((s) => s.student.attendanceNumber)).toEqual([
      1, 2,
    ]);
    expect(groups[0].students.map((s) => s.status)).toEqual([
      "absent",
      "unmarked",
    ]);
  });

  it("日付指定の提出物は対象日にだけ未提出者一覧に出る", async () => {
    await addDateSubmission({
      cohortId,
      name: "計算プリント",
      date: DATE,
      deadline: "08:15",
    });
    await addStudent({ cohortId, attendanceNumber: 1 });

    const groups = await listTodayNonSubmitters(
      cohortId,
      DATE,
      new Date(2026, 7, 24, 7, 0),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].type.name).toBe("計算プリント");
  });

  it("日付指定の提出物は対象日以外には出ない", async () => {
    await addDateSubmission({
      cohortId,
      name: "計算プリント",
      date: "2026-08-25",
      deadline: "08:15",
    });
    await addStudent({ cohortId, attendanceNumber: 1 });

    const groups = await listTodayNonSubmitters(
      cohortId,
      DATE,
      new Date(2026, 7, 24, 7, 0),
    );

    expect(groups).toEqual([]);
  });
});

/** 提出物のcreatedAtを過去にずらす。集計期間より前に作られたことにするため。 */
async function backdateType(id: string, daysAgo: number): Promise<void> {
  const db = await getDb();
  const type = await db.get("submissionTypes", id);
  if (type === undefined) {
    throw new Error("提出物が見つかりません(テストの前提が壊れている)");
  }
  await db.put("submissionTypes", {
    ...type,
    createdAt: Date.now() - daysAgo * 24 * 60 * 60 * 1000,
  });
}

describe("countRecentNonSubmissions", () => {
  const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
  const today = toDateKey(new Date());

  it("生徒ごとに未提出回数を数える。0回の生徒は含まない", async () => {
    const type = await addSubmissionType({
      cohortId,
      name: "毎日の提出物",
      deadline: "00:00", // 常に過ぎている扱いにして時刻依存のテストにしない
      weekdays: EVERY_DAY,
    });
    await backdateType(type.id, 30);

    const dates = recentDateKeys(today, 3);
    const missed = await addStudent({ cohortId, attendanceNumber: 1 });
    const submitted = await addStudent({ cohortId, attendanceNumber: 2 });

    for (const date of dates) {
      await recordSubmission({
        cohortId,
        studentId: submitted.id,
        submissionTypeIds: [type.id],
        date,
      });
    }

    const result = await countRecentNonSubmissions(
      cohortId,
      today,
      new Date(),
      3,
    );

    expect(result).toHaveLength(1);
    expect(result[0].student.attendanceNumber).toBe(missed.attendanceNumber);
    expect(result[0].count).toBe(3);
  });

  it("多い順に並べる。同数なら出席番号昇順", async () => {
    const type = await addSubmissionType({
      cohortId,
      name: "毎日の提出物",
      deadline: "00:00",
      weekdays: EVERY_DAY,
    });
    await backdateType(type.id, 30);

    const dates = recentDateKeys(today, 3);
    const worst = await addStudent({ cohortId, attendanceNumber: 3 }); // 3回とも未提出
    const tieA = await addStudent({ cohortId, attendanceNumber: 5 }); // 1回だけ提出
    const tieB = await addStudent({ cohortId, attendanceNumber: 2 }); // 1回だけ提出

    await recordSubmission({
      cohortId,
      studentId: tieA.id,
      submissionTypeIds: [type.id],
      date: dates[0],
    });
    await recordSubmission({
      cohortId,
      studentId: tieB.id,
      submissionTypeIds: [type.id],
      date: dates[0],
    });

    const result = await countRecentNonSubmissions(
      cohortId,
      today,
      new Date(),
      3,
    );

    expect(result.map((r) => r.student.attendanceNumber)).toEqual([
      worst.attendanceNumber,
      tieB.attendanceNumber,
      tieA.attendanceNumber,
    ]);
  });

  it("終了した提出物は数えない", async () => {
    const type = await addSubmissionType({
      cohortId,
      name: "終了した提出物",
      deadline: "00:00",
      weekdays: EVERY_DAY,
    });
    await backdateType(type.id, 30);
    await endSubmissionType(type.id);
    await addStudent({ cohortId, attendanceNumber: 1 });

    const result = await countRecentNonSubmissions(
      cohortId,
      today,
      new Date(),
      3,
    );

    expect(result).toEqual([]);
  });

  it("提出物の作成日より前の日付は数えない", async () => {
    // backdateしない。作成日は「今」のまま。
    await addSubmissionType({
      cohortId,
      name: "今日登録した提出物",
      deadline: "00:00",
      weekdays: EVERY_DAY,
    });
    await addStudent({ cohortId, attendanceNumber: 1 });

    const result = await countRecentNonSubmissions(
      cohortId,
      today,
      new Date(),
      3,
    );

    // 直近3日のうち、作成日である今日ぶんしか数えない
    expect(result[0].count).toBe(1);
  });

  it("転出した生徒は数えない", async () => {
    const type = await addSubmissionType({
      cohortId,
      name: "毎日の提出物",
      deadline: "00:00",
      weekdays: EVERY_DAY,
    });
    await backdateType(type.id, 30);
    const out = await addStudent({ cohortId, attendanceNumber: 1 });
    await transferOutStudent(out.id);

    const result = await countRecentNonSubmissions(
      cohortId,
      today,
      new Date(),
      3,
    );

    expect(result).toEqual([]);
  });

  it("欠席とマークされた日は未提出カウントに含めない", async () => {
    const type = await addSubmissionType({
      cohortId,
      name: "毎日の提出物",
      deadline: "00:00",
      weekdays: EVERY_DAY,
    });
    await backdateType(type.id, 30);

    const dates = recentDateKeys(today, 3);
    const student = await addStudent({ cohortId, attendanceNumber: 1 });

    for (const date of dates) {
      await markAbsent({
        cohortId,
        studentId: student.id,
        submissionTypeId: type.id,
        date,
      });
    }

    const result = await countRecentNonSubmissions(
      cohortId,
      today,
      new Date(),
      3,
    );

    expect(result).toEqual([]);
  });

  it("日付指定の提出物は対象日だけを未提出カウントに含める", async () => {
    await addDateSubmission({
      cohortId,
      name: "日付指定の宿題",
      date: today,
      deadline: "00:00",
    });
    const student = await addStudent({ cohortId, attendanceNumber: 1 });

    const result = await countRecentNonSubmissions(
      cohortId,
      today,
      new Date(),
      3,
    );

    expect(result).toHaveLength(1);
    expect(result[0].student.id).toBe(student.id);
    expect(result[0].count).toBe(1);
  });
});
