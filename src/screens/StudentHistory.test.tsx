import { useFreshDb } from "../test/db";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { renderAsTeacher } from "../test/router";
import { createCohort } from "../db/cohorts";
import { addStudent } from "../db/students";
import { addSubmissionType, deleteSubmissionType } from "../db/submissionTypes";
import { gradeSubmission } from "../db/grading";
import { getDb } from "../db/schema";
import { markAbsent, recordSubmission } from "../db/submissions";
import { formatDateHeading } from "../lib/date";

useFreshDb();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function renderHistory(studentId: string) {
  return renderAsTeacher(`/roster/${studentId}/history`);
}

describe("読み込み", () => {
  it("出席番号を見出しに出す", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    renderHistory(student.id);

    expect(await screen.findByText("12番の提出履歴")).toBeInTheDocument();
  });

  it("居ない生徒なら見つからないと伝える", async () => {
    renderHistory("missing");
    expect(
      await screen.findByText("この生徒は見つかりません"),
    ).toBeInTheDocument();
  });

  it("記録が無ければ案内を出す", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    renderHistory(student.id);

    expect(
      await screen.findByText("まだ提出記録がありません"),
    ).toBeInTheDocument();
  });
});

describe("記録の表示", () => {
  it("日付・提出物名・未採点を出す", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
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

    renderHistory(student.id);

    const heading = formatDateHeading(new Date(2026, 7, 24));
    const item = await screen.findByRole("listitem");
    expect(item).toHaveTextContent(`${heading} 計算ドリル`);
    expect(screen.getByText("未採点")).toBeInTheDocument();
  });

  it("新しい日付が上に来る", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
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
    await recordSubmission({
      cohortId,
      studentId: student.id,
      submissionTypeIds: [type.id],
      date: "2026-08-25",
    });

    renderHistory(student.id);

    const items = await screen.findAllByRole("listitem");
    const olderHeading = formatDateHeading(new Date(2026, 7, 24));
    const newerHeading = formatDateHeading(new Date(2026, 7, 25));
    expect(items[0]).toHaveTextContent(newerHeading);
    expect(items[1]).toHaveTextContent(olderHeading);
  });

  it("合格・再提出待ちを反映する", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    const type = await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [1, 2, 3, 4, 5],
    });
    const result = await recordSubmission({
      cohortId,
      studentId: student.id,
      submissionTypeIds: [type.id],
      date: "2026-08-24",
    });
    const db = await getDb();
    const [submission] = await db.getAllFromIndex(
      "submissions",
      "by-cohort-date",
      [cohortId, "2026-08-24"],
    );
    await gradeSubmission(submission.id, "resubmit");
    expect(result.kind).toBe("recorded");

    renderHistory(student.id);

    expect(await screen.findByText("再提出待ち")).toBeInTheDocument();
  });

  it("欠席の記録を出す", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    const type = await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [1, 2, 3, 4, 5],
    });
    await markAbsent({
      cohortId,
      studentId: student.id,
      submissionTypeId: type.id,
      date: "2026-08-24",
    });

    renderHistory(student.id);

    expect(await screen.findByText("欠席")).toBeInTheDocument();
  });

  it("完全に削除された提出物は名前の代わりに理由を出す", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
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
    await deleteSubmissionType(type.id);

    renderHistory(student.id);

    const item = await screen.findByRole("listitem");
    expect(item).toHaveTextContent("(削除された提出物)");
  });
});
