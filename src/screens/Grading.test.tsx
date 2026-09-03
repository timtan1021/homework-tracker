import { useFreshDb } from "../test/db";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderAsTeacher } from "../test/router";
import { createCohort } from "../db/cohorts";
import { addStudent } from "../db/students";
import { addSubmissionType } from "../db/submissionTypes";
import { addDateSubmission } from "../db/dateSubmissions";
import { recordSubmission } from "../db/submissions";
import { getDb } from "../db/schema";
import * as gradingModule from "../db/grading";
import { formatDateHeading, toDateKey } from "../lib/date";

useFreshDb();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;

  const type = await addSubmissionType({
    cohortId,
    name: "計算ドリル",
    deadline: "08:15",
    weekdays: [1, 2, 3, 4, 5],
  });
  const student = await addStudent({ cohortId, attendanceNumber: 5 });

  await recordSubmission({
    cohortId,
    studentId: student.id,
    submissionTypeIds: [type.id],
    date: "2026-08-24", // 月曜
  });
});

describe("採点画面", () => {
  it("未採点の提出物を提出物ごとにまとめて表示する", async () => {
    renderAsTeacher("/grading");

    expect(await screen.findByText("計算ドリル")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "8月24日(月)の5番（計算ドリル）を合格にする" }),
    ).toBeInTheDocument();
  });

  it("再提出待ちが無ければ案内を出す", async () => {
    renderAsTeacher("/grading");
    await screen.findByText("計算ドリル");

    expect(
      screen.getByText("再提出待ちの生徒はいません"),
    ).toBeInTheDocument();
  });

  it("合格にすると未採点セクションから消える", async () => {
    const user = userEvent.setup();
    renderAsTeacher("/grading");

    await user.click(
      await screen.findByRole("button", {
        name: "8月24日(月)の5番（計算ドリル）を合格にする",
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("未採点の提出物はありません"),
      ).toBeInTheDocument();
    });
  });

  it("再提出にすると再提出待ちセクションに移る", async () => {
    const user = userEvent.setup();
    renderAsTeacher("/grading");

    await user.click(
      await screen.findByRole("button", {
        name: "8月24日(月)の5番（計算ドリル）を再提出にする",
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("未採点の提出物はありません"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", {
          name: "8月24日(月)の5番（計算ドリル）を未採点に戻す",
        }),
      ).toBeInTheDocument();
    });
  });

  it("再提出待ちから未採点に戻せる", async () => {
    const user = userEvent.setup();
    renderAsTeacher("/grading");

    await user.click(
      await screen.findByRole("button", {
        name: "8月24日(月)の5番（計算ドリル）を再提出にする",
      }),
    );
    await screen.findByRole("button", {
      name: "8月24日(月)の5番（計算ドリル）を未採点に戻す",
    });

    await user.click(
      screen.getByRole("button", {
        name: "8月24日(月)の5番（計算ドリル）を未採点に戻す",
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("再提出待ちの生徒はいません"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "8月24日(月)の5番（計算ドリル）を合格にする" }),
      ).toBeInTheDocument();
    });
  });

  it("再提出待ちから合格にできる", async () => {
    const user = userEvent.setup();
    renderAsTeacher("/grading");

    await user.click(
      await screen.findByRole("button", {
        name: "8月24日(月)の5番（計算ドリル）を再提出にする",
      }),
    );
    await screen.findByRole("button", {
      name: "8月24日(月)の5番（計算ドリル）を未採点に戻す",
    });

    await user.click(
      screen.getByRole("button", { name: "8月24日(月)の5番（計算ドリル）を合格にする" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("再提出待ちの生徒はいません"),
      ).toBeInTheDocument();
    });
  });

  it("書き込みに失敗するとエラーを表示する", async () => {
    const user = userEvent.setup();
    const spy = vi
      .spyOn(gradingModule, "gradeSubmission")
      .mockRejectedValueOnce(new Error("採点できませんでした"));

    renderAsTeacher("/grading");

    await user.click(
      await screen.findByRole("button", {
        name: "8月24日(月)の5番（計算ドリル）を合格にする",
      }),
    );

    expect(
      await screen.findByText("採点できませんでした"),
    ).toBeInTheDocument();

    spy.mockRestore();
  });

  it("同じ日付・同じ表示順の日付指定提出物が複数あっても見出しが分裂しない", async () => {
    // 日付指定の提出物(addDateSubmission)はorderが常に0のため、
    // 同日締切の2件が並ぶと表示順→日付のタイブレークが両方とも同点になり、
    // 出席番号だけで最終順位が決まる。生徒側の出席番号が交互だと
    // 提出物の項目が配列上で入り交じり、見出しが分裂する不具合を再現する。
    const today = toDateKey(new Date());
    const typeA = await addDateSubmission({
      cohortId,
      name: "遠足のしおり",
      date: today,
      deadline: "08:15",
    });
    const typeB = await addDateSubmission({
      cohortId,
      name: "校外学習の同意書",
      date: today,
      deadline: "08:15",
    });

    const student1 = await addStudent({ cohortId, attendanceNumber: 1 });
    const student2 = await addStudent({ cohortId, attendanceNumber: 2 });
    const student3 = await addStudent({ cohortId, attendanceNumber: 3 });

    await recordSubmission({
      cohortId,
      studentId: student1.id,
      submissionTypeIds: [typeA.id],
      date: today,
    });
    await recordSubmission({
      cohortId,
      studentId: student2.id,
      submissionTypeIds: [typeB.id],
      date: today,
    });
    await recordSubmission({
      cohortId,
      studentId: student3.id,
      submissionTypeIds: [typeA.id],
      date: today,
    });

    renderAsTeacher("/grading");

    await screen.findByText("計算ドリル");

    expect(await screen.findAllByText("遠足のしおり")).toHaveLength(1);
    expect(await screen.findAllByText("校外学習の同意書")).toHaveLength(1);
  });

  it("既定で今日の日付を表示する", async () => {
    renderAsTeacher("/grading");

    expect(
      await screen.findByText(formatDateHeading(new Date())),
    ).toBeInTheDocument();
  });

  it("日付を送ると、その日に受け取った未採点だけに絞られる", async () => {
    const user = userEvent.setup();
    const otherType = await addSubmissionType({
      cohortId,
      name: "日記",
      deadline: "08:15",
      weekdays: [1, 2, 3, 4, 5],
    });
    const other = await addStudent({ cohortId, attendanceNumber: 9 });
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const db = await getDb();
    await db.put("submissions", {
      id: "yesterday-submission",
      cohortId,
      studentId: other.id,
      submissionTypeId: otherType.id,
      date: toDateKey(yesterday),
      submittedAt: yesterday.getTime(),
      status: "submitted",
    });

    renderAsTeacher("/grading");

    await screen.findByText("計算ドリル");
    expect(screen.queryByText("日記")).toBeNull();

    await user.click(screen.getByRole("button", { name: "← 前日" }));

    await screen.findByText("日記");
    expect(screen.queryByText("計算ドリル")).toBeNull();
  });

  it("再提出待ちは日付を送っても表示され続ける", async () => {
    const user = userEvent.setup();
    renderAsTeacher("/grading");

    await user.click(
      await screen.findByRole("button", {
        name: "8月24日(月)の5番（計算ドリル）を再提出にする",
      }),
    );
    await screen.findByRole("button", {
      name: "8月24日(月)の5番（計算ドリル）を未採点に戻す",
    });

    await user.click(screen.getByRole("button", { name: "← 前日" }));

    expect(
      await screen.findByRole("button", {
        name: "8月24日(月)の5番（計算ドリル）を未採点に戻す",
      }),
    ).toBeInTheDocument();
  });

  it("ほかの日に未採点があれば案内を出し、押すとその日へ移る", async () => {
    const user = userEvent.setup();
    const otherType = await addSubmissionType({
      cohortId,
      name: "日記",
      deadline: "08:15",
      weekdays: [1, 2, 3, 4, 5],
    });
    const other = await addStudent({ cohortId, attendanceNumber: 9 });
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const db = await getDb();
    await db.put("submissions", {
      id: "two-days-ago-submission",
      cohortId,
      studentId: other.id,
      submissionTypeId: otherType.id,
      date: toDateKey(twoDaysAgo),
      submittedAt: twoDaysAgo.getTime(),
      status: "submitted",
    });

    renderAsTeacher("/grading");

    const link = await screen.findByRole("button", {
      name: "ほかの日に未採点 1件 → 一番古い日へ",
    });
    await user.click(link);

    expect(await screen.findByText("日記")).toBeInTheDocument();
    expect(
      await screen.findByText(formatDateHeading(twoDaysAgo)),
    ).toBeInTheDocument();
  });

  it("提出日より後に受け取った行は「遅れて提出」と表示する", async () => {
    renderAsTeacher("/grading");

    const row = (
      await screen.findByRole("button", {
        name: "8月24日(月)の5番（計算ドリル）を合格にする",
      })
    ).closest("li");
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent("遅れて提出");
  });

  it("提出日より前に受け取った行は「先に提出」と表示する", async () => {
    const early = await addStudent({ cohortId, attendanceNumber: 9 });
    const type = await addSubmissionType({
      cohortId,
      name: "日記",
      deadline: "08:15",
      weekdays: [1, 2, 3, 4, 5],
    });
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const tomorrowKey = toDateKey(tomorrow);
    await recordSubmission({
      cohortId,
      studentId: early.id,
      submissionTypeIds: [type.id],
      date: tomorrowKey,
    });

    renderAsTeacher("/grading");

    const row = (
      await screen.findByRole("button", {
        name: `${formatDateHeading(tomorrow)}の9番（日記）を合格にする`,
      })
    ).closest("li");
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent("先に提出");
  });

  it("受け取った日が違う再提出待ちを未採点に戻すと、その受け取った日へ移る", async () => {
    const user = userEvent.setup();
    const otherType = await addSubmissionType({
      cohortId,
      name: "日記",
      deadline: "08:15",
      weekdays: [1, 2, 3, 4, 5],
    });
    const other = await addStudent({ cohortId, attendanceNumber: 9 });
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yesterdayKey = toDateKey(yesterday);

    const db = await getDb();
    await db.put("submissions", {
      id: "resubmit-yesterday",
      cohortId,
      studentId: other.id,
      submissionTypeId: otherType.id,
      date: yesterdayKey,
      submittedAt: yesterday.getTime(),
      status: "submitted",
      grade: "resubmit",
    });

    renderAsTeacher("/grading");

    await user.click(
      await screen.findByRole("button", {
        name: `${formatDateHeading(yesterday)}の9番（日記）を未採点に戻す`,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(formatDateHeading(yesterday))).toBeInTheDocument();
      expect(
        screen.getByRole("button", {
          name: `${formatDateHeading(yesterday)}の9番（日記）を合格にする`,
        }),
      ).toBeInTheDocument();
    });
  });
});
