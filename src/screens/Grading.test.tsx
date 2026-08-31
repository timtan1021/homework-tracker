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
import * as gradingModule from "../db/grading";
import { toDateKey } from "../lib/date";

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

    await screen.findByText("未採点の提出物はありません");
    expect(
      screen.getByRole("button", {
        name: "8月24日(月)の5番（計算ドリル）を未採点に戻す",
      }),
    ).toBeInTheDocument();
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
    });
    expect(
      screen.getByRole("button", { name: "8月24日(月)の5番（計算ドリル）を合格にする" }),
    ).toBeInTheDocument();
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
});
