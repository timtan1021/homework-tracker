import { useFreshDb } from "../test/db";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderAsTeacher } from "../test/router";
import { createCohort } from "../db/cohorts";
import { addStudent, transferOutStudent } from "../db/students";
import { addSubmissionType } from "../db/submissionTypes";
import { markAbsent, recordSubmission } from "../db/submissions";
import { toDateKey } from "../lib/date";
import * as submissionsModule from "../db/submissions";

useFreshDb();

const today = new Date();
const todayKey = toDateKey(today);
const todayWeekday = today.getDay();
const otherWeekday = (todayWeekday + 1) % 7;

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function renderAt(path: string) {
  return renderAsTeacher(path);
}

describe("未提出者・集計画面", () => {
  it("今日提出日の提出物が無ければ案内を出す", async () => {
    await addSubmissionType({
      cohortId,
      name: "今日は提出日でない提出物",
      deadline: "08:15",
      weekdays: [otherWeekday],
    });

    renderAt("/unsubmitted");

    expect(
      await screen.findByText("今日は確認する提出物がありません"),
    ).toBeInTheDocument();
  });

  it("未提出の生徒を出席番号順に表示し、締切前は残り時間を出す", async () => {
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "23:59",
      weekdays: [todayWeekday],
    });
    await addStudent({ cohortId, attendanceNumber: 12 });
    await addStudent({ cohortId, attendanceNumber: 3 });

    renderAt("/unsubmitted");

    expect(
      await screen.findByText("計算ドリル・締切23:59"),
    ).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText(/^あと\d+分$/)).toBeInTheDocument();
  });

  it("提出済みなら全員提出しましたに置き換える", async () => {
    const type = await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "23:59",
      weekdays: [todayWeekday],
    });
    const student = await addStudent({ cohortId, attendanceNumber: 7 });
    await recordSubmission({
      cohortId,
      studentId: student.id,
      submissionTypeIds: [type.id],
      date: todayKey,
    });

    renderAt("/unsubmitted");

    expect(
      await screen.findByText("計算ドリルは全員提出しました"),
    ).toBeInTheDocument();
  });

  it("締切を過ぎたら確定と表示する", async () => {
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "00:00",
      weekdays: [todayWeekday],
    });
    await addStudent({ cohortId, attendanceNumber: 1 });

    renderAt("/unsubmitted");

    expect(await screen.findByText("確定")).toBeInTheDocument();
  });

  it("転出した生徒は一覧に出さない", async () => {
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "23:59",
      weekdays: [todayWeekday],
    });
    const out = await addStudent({ cohortId, attendanceNumber: 9 });
    await transferOutStudent(out.id);

    renderAt("/unsubmitted");

    await screen.findByText("計算ドリル・締切23:59");
    expect(screen.queryByText("9")).toBeNull();
  });

  it("直近の未提出が無ければ案内を出す", async () => {
    renderAt("/unsubmitted");

    expect(await screen.findByText("未提出はありません")).toBeInTheDocument();
  });

  it("今日の未提出は集計にも反映される", async () => {
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "00:00",
      weekdays: [todayWeekday],
    });
    await addStudent({ cohortId, attendanceNumber: 4 });

    renderAt("/unsubmitted");

    expect(await screen.findByText("4番")).toBeInTheDocument();
    expect(screen.getByText("1回")).toBeInTheDocument();
  });

  it("未提出のセルをタップして欠席にできる", async () => {
    const user = userEvent.setup();
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "23:59",
      weekdays: [todayWeekday],
    });
    await addStudent({ cohortId, attendanceNumber: 5 });

    renderAt("/unsubmitted");

    await user.click(await screen.findByRole("button", { name: "5番" }));
    await user.click(
      await screen.findByRole("button", { name: "欠席にする" }),
    );

    const cell = await screen.findByRole("button", { name: "5番（欠席）" });
    expect(cell).toHaveAttribute("data-status", "absent");
  });

  it("欠席のセルをタップして取り消せる", async () => {
    const user = userEvent.setup();
    const type = await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "23:59",
      weekdays: [todayWeekday],
    });
    const student = await addStudent({ cohortId, attendanceNumber: 5 });
    await markAbsent({
      cohortId,
      studentId: student.id,
      submissionTypeId: type.id,
      date: todayKey,
    });

    renderAt("/unsubmitted");

    await user.click(
      await screen.findByRole("button", { name: "5番（欠席）" }),
    );
    await user.click(await screen.findByRole("button", { name: "取り消す" }));

    const cell = await screen.findByRole("button", { name: "5番" });
    expect(cell).toHaveAttribute("data-status", "unmarked");
  });

  it("やめるを押すと何も変わらない", async () => {
    const user = userEvent.setup();
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "23:59",
      weekdays: [todayWeekday],
    });
    await addStudent({ cohortId, attendanceNumber: 5 });

    renderAt("/unsubmitted");

    await user.click(await screen.findByRole("button", { name: "5番" }));
    await user.click(await screen.findByRole("button", { name: "やめる" }));

    const cell = await screen.findByRole("button", { name: "5番" });
    expect(cell).toHaveAttribute("data-status", "unmarked");
  });

  it("欠席にすると直近2週間の集計から除外される", async () => {
    const user = userEvent.setup();
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "00:00",
      weekdays: [todayWeekday],
    });
    await addStudent({ cohortId, attendanceNumber: 4 });

    renderAt("/unsubmitted");

    expect(await screen.findByText("4番")).toBeInTheDocument();
    expect(screen.getByText("1回")).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "4番" }));
    await user.click(
      await screen.findByRole("button", { name: "欠席にする" }),
    );

    await screen.findByText("未提出はありません");
    expect(screen.queryByText("4番")).toBeNull();
  });

  it("欠席にする際に保存に失敗したらエラーを表示し、セルの状態は変わらない", async () => {
    const user = userEvent.setup();
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "23:59",
      weekdays: [todayWeekday],
    });
    await addStudent({ cohortId, attendanceNumber: 6 });

    const spy = vi
      .spyOn(submissionsModule, "markAbsent")
      .mockRejectedValueOnce(new Error("ストレージにアクセスできません"));

    renderAt("/unsubmitted");

    await user.click(await screen.findByRole("button", { name: "6番" }));
    await user.click(
      await screen.findByRole("button", { name: "欠席にする" }),
    );

    expect(
      await screen.findByText("ストレージにアクセスできません"),
    ).toBeInTheDocument();

    const cell = screen.getByRole("button", { name: "6番" });
    expect(cell).toHaveAttribute("data-status", "unmarked");

    spy.mockRestore();
  });
});
