import { useFreshDb } from "../test/db";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderAsTeacher } from "../test/router";
import { createCohort } from "../db/cohorts";
import { addStudent } from "../db/students";
import { addSubmissionType } from "../db/submissionTypes";
import { recordSubmission } from "../db/submissions";
import * as gradingModule from "../db/grading";

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
      screen.getByRole("button", { name: "8月24日(月)の5番を合格にする" }),
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
        name: "8月24日(月)の5番を合格にする",
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
        name: "8月24日(月)の5番を再提出にする",
      }),
    );

    await screen.findByText("未採点の提出物はありません");
    expect(
      screen.getByRole("button", {
        name: "8月24日(月)の5番を未採点に戻す",
      }),
    ).toBeInTheDocument();
  });

  it("再提出待ちから未採点に戻せる", async () => {
    const user = userEvent.setup();
    renderAsTeacher("/grading");

    await user.click(
      await screen.findByRole("button", {
        name: "8月24日(月)の5番を再提出にする",
      }),
    );
    await screen.findByRole("button", {
      name: "8月24日(月)の5番を未採点に戻す",
    });

    await user.click(
      screen.getByRole("button", {
        name: "8月24日(月)の5番を未採点に戻す",
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("再提出待ちの生徒はいません"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "8月24日(月)の5番を合格にする" }),
    ).toBeInTheDocument();
  });

  it("再提出待ちから合格にできる", async () => {
    const user = userEvent.setup();
    renderAsTeacher("/grading");

    await user.click(
      await screen.findByRole("button", {
        name: "8月24日(月)の5番を再提出にする",
      }),
    );
    await screen.findByRole("button", {
      name: "8月24日(月)の5番を未採点に戻す",
    });

    await user.click(
      screen.getByRole("button", { name: "8月24日(月)の5番を合格にする" }),
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
        name: "8月24日(月)の5番を合格にする",
      }),
    );

    expect(
      await screen.findByText("採点できませんでした"),
    ).toBeInTheDocument();

    spy.mockRestore();
  });
});
