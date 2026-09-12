import { useFreshDb } from "../test/db";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderAsTeacher } from "../test/router";
import { createCohort } from "../db/cohorts";
import { setSetting } from "../db/settings";
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

function drill(deadline = "23:59") {
  return addSubmissionType({
    cohortId,
    name: "計算ドリル",
    deadline,
    weekdays: [todayWeekday],
  });
}

describe("提出チェック表", () => {
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

  it("在籍生徒を全員、出席番号順に行として出す", async () => {
    await drill();
    await addStudent({ cohortId, attendanceNumber: 12 });
    await addStudent({ cohortId, attendanceNumber: 3 });

    renderAt("/unsubmitted");

    const headers = await screen.findAllByRole("rowheader");
    expect(headers.map((header) => header.textContent)).toEqual(["3", "12"]);
  });

  it("提出済み・未提出・欠席をセルで出し、列見出しに人数を出す", async () => {
    const type = await drill();
    const a = await addStudent({ cohortId, attendanceNumber: 1 });
    const b = await addStudent({ cohortId, attendanceNumber: 2 });
    await addStudent({ cohortId, attendanceNumber: 3 });
    await recordSubmission({
      cohortId,
      studentId: a.id,
      submissionTypeIds: [type.id],
      date: todayKey,
    });
    await markAbsent({
      cohortId,
      studentId: b.id,
      submissionTypeId: type.id,
      date: todayKey,
    });

    renderAt("/unsubmitted");

    expect(
      await screen.findByRole("img", { name: "1番 計算ドリル 提出済み" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "2番 計算ドリル 欠席" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "3番 計算ドリル 未提出" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("1/3").length).toBeGreaterThan(0);
  });

  it("締切前は残り時間、締切後は確定を出す", async () => {
    await drill("23:59");
    await addSubmissionType({
      cohortId,
      name: "朝の提出物",
      deadline: "00:00",
      weekdays: [todayWeekday],
    });
    await addStudent({ cohortId, attendanceNumber: 1 });

    renderAt("/unsubmitted");

    expect(await screen.findByText(/^あと\d+分$/)).toBeInTheDocument();
    expect(screen.getByText("確定")).toBeInTheDocument();
  });

  it("転出した生徒は行に出ない", async () => {
    await drill();
    const out = await addStudent({ cohortId, attendanceNumber: 9 });
    await transferOutStudent(out.id);
    await addStudent({ cohortId, attendanceNumber: 1 });

    renderAt("/unsubmitted");

    await screen.findAllByRole("rowheader");
    expect(screen.queryByText("9")).toBeNull();
  });

  it("全員提出した提出物は帯で知らせる", async () => {
    const type = await drill();
    const a = await addStudent({ cohortId, attendanceNumber: 1 });
    await recordSubmission({
      cohortId,
      studentId: a.id,
      submissionTypeIds: [type.id],
      date: todayKey,
    });

    renderAt("/unsubmitted");

    expect(await screen.findByText("計算ドリル 全員提出")).toBeInTheDocument();
    expect(screen.getByText("全員")).toBeInTheDocument();
  });

  it("氏名は設定に従う", async () => {
    await drill();
    await addStudent({ cohortId, attendanceNumber: 1, name: "青木" });
    await setSetting("showStudentNames", true);

    renderAt("/unsubmitted");

    expect(await screen.findByText("青木")).toBeInTheDocument();
  });
});

describe("欠席マーク", () => {
  it("未提出のセルをタップして欠席にできる", async () => {
    const user = userEvent.setup();
    await drill();
    await addStudent({ cohortId, attendanceNumber: 5 });

    renderAt("/unsubmitted");

    await user.click(
      await screen.findByRole("button", { name: "5番 計算ドリル 未提出" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "欠席にする" }),
    );

    expect(
      await screen.findByRole("button", { name: "5番 計算ドリル 欠席" }),
    ).toBeInTheDocument();
  });

  it("欠席のセルをタップして取り消せる", async () => {
    const user = userEvent.setup();
    const type = await drill();
    const student = await addStudent({ cohortId, attendanceNumber: 5 });
    await markAbsent({
      cohortId,
      studentId: student.id,
      submissionTypeId: type.id,
      date: todayKey,
    });

    renderAt("/unsubmitted");

    await user.click(
      await screen.findByRole("button", { name: "5番 計算ドリル 欠席" }),
    );
    await user.click(await screen.findByRole("button", { name: "取り消す" }));

    expect(
      await screen.findByRole("button", { name: "5番 計算ドリル 未提出" }),
    ).toBeInTheDocument();
  });

  it("やめるを押すと何も変わらない", async () => {
    const user = userEvent.setup();
    await drill();
    await addStudent({ cohortId, attendanceNumber: 5 });

    renderAt("/unsubmitted");

    await user.click(
      await screen.findByRole("button", { name: "5番 計算ドリル 未提出" }),
    );
    await user.click(await screen.findByRole("button", { name: "やめる" }));

    expect(
      await screen.findByRole("button", { name: "5番 計算ドリル 未提出" }),
    ).toBeInTheDocument();
  });

  it("欠席にすると直近2週間の集計から除外される", async () => {
    const user = userEvent.setup();
    await drill("00:00");
    await addStudent({ cohortId, attendanceNumber: 4 });

    renderAt("/unsubmitted");

    const ranking = await screen.findByRole("list", { name: "直近2週間で未提出が多い生徒" });
    expect(within(ranking).getByText("4番")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "4番 計算ドリル 未提出" }));
    await user.click(await screen.findByRole("button", { name: "欠席にする" }));

    expect(await screen.findByText("未提出はありません")).toBeInTheDocument();
  });

  it("保存に失敗したらエラーを表示し、セルは変わらない", async () => {
    const user = userEvent.setup();
    await drill();
    await addStudent({ cohortId, attendanceNumber: 6 });

    const spy = vi
      .spyOn(submissionsModule, "markAbsent")
      .mockRejectedValueOnce(new Error("ストレージにアクセスできません"));

    renderAt("/unsubmitted");

    await user.click(
      await screen.findByRole("button", { name: "6番 計算ドリル 未提出" }),
    );
    await user.click(await screen.findByRole("button", { name: "欠席にする" }));

    expect(
      await screen.findByText("ストレージにアクセスできません"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "6番 計算ドリル 未提出" }),
    ).toBeInTheDocument();

    spy.mockRestore();
  });
});

describe("直近2週間の集計", () => {
  it("未提出が無ければ案内を出す", async () => {
    renderAt("/unsubmitted");

    expect(await screen.findByText("未提出はありません")).toBeInTheDocument();
  });

  it("今日の未提出は集計にも反映される", async () => {
    await drill("00:00");
    await addStudent({ cohortId, attendanceNumber: 4 });

    renderAt("/unsubmitted");

    const ranking = await screen.findByRole("list", { name: "直近2週間で未提出が多い生徒" });
    expect(within(ranking).getByText("4番")).toBeInTheDocument();
    expect(within(ranking).getByText("1回")).toBeInTheDocument();
  });
});

describe("日付送り", () => {
  it("日付を前へ送ると、その日の表に切り替わる", async () => {
    const user = userEvent.setup();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await addSubmissionType({
      cohortId,
      name: "日記",
      deadline: "23:59",
      weekdays: [yesterday.getDay()],
    });
    await addStudent({ cohortId, attendanceNumber: 8 });

    renderAt("/unsubmitted");
    await screen.findByText("今日は確認する提出物がありません");

    await user.click(screen.getByRole("button", { name: "← 前日" }));

    expect(
      await screen.findByRole("button", { name: "8番 日記 未提出" }),
    ).toBeInTheDocument();
  });

  it("翌日へ送ると列見出しが「締切 HH:mm」になり「あと◯分」は出ない", async () => {
    const user = userEvent.setup();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [tomorrow.getDay()],
    });
    await addStudent({ cohortId, attendanceNumber: 1 });

    renderAt("/unsubmitted");
    await user.click(await screen.findByRole("button", { name: "翌日 →" }));

    expect(await screen.findByText("締切 08:15")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText(/^あと\d+分$/)).toBeNull();
    });
  });

  it("今日以外を見ているときは見出しと案内の文言が変わる", async () => {
    const user = userEvent.setup();
    renderAt("/unsubmitted");

    await screen.findByText("今日の提出状況");
    await user.click(screen.getByRole("button", { name: "← 前日" }));

    expect(await screen.findByText("この日の提出状況")).toBeInTheDocument();
    expect(
      await screen.findByText("この日は確認する提出物がありません"),
    ).toBeInTheDocument();
  });

  it("日付を送っても画面の外枠は消えない", async () => {
    const user = userEvent.setup();
    renderAt("/unsubmitted");

    await screen.findByText("今日の提出状況");
    await user.click(screen.getByRole("button", { name: "← 前日" }));

    // 読み込み中も DateStepper は残る(全画面の読み込み表示に戻らない)
    expect(screen.getByRole("button", { name: "今日へ" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("この日の提出状況")).toBeInTheDocument();
    });
  });
});
