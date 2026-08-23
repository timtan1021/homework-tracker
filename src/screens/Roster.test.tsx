import { useFreshDb } from "../test/db";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { AppRoutes } from "../App";
import { createCohort } from "../db/cohorts";
import { getSetting, setSetting } from "../db/settings";
import { addStudent, transferOutStudent } from "../db/students";

useFreshDb();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function renderRoster() {
  return render(
    <MemoryRouter initialEntries={["/roster"]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("名簿のヘッダー", () => {
  it("年度とクラス名を表示する", async () => {
    renderRoster();
    expect(await screen.findByText("2026年度 5年1組")).toBeInTheDocument();
  });

  it("在籍と欠番の人数を表示する", async () => {
    await addStudent({ cohortId, attendanceNumber: 1 });
    await addStudent({ cohortId, attendanceNumber: 2 });
    const out = await addStudent({ cohortId, attendanceNumber: 3 });
    await transferOutStudent(out.id);

    renderRoster();
    expect(await screen.findByText("在籍2人・欠番1")).toBeInTheDocument();
  });
});

describe("名簿のグリッド", () => {
  it("在籍と欠番を描き分ける", async () => {
    await addStudent({ cohortId, attendanceNumber: 1 });
    const out = await addStudent({ cohortId, attendanceNumber: 2 });
    await transferOutStudent(out.id);

    renderRoster();

    const cells = await screen.findAllByTestId("student-cell");
    expect(cells).toHaveLength(2);
    expect(cells[0]).toHaveAttribute("data-status", "active");
    expect(cells[1]).toHaveAttribute("data-status", "transferredOut");
  });

  it("出席番号の昇順に並べる", async () => {
    await addStudent({ cohortId, attendanceNumber: 3 });
    await addStudent({ cohortId, attendanceNumber: 1 });

    renderRoster();

    const cells = await screen.findAllByTestId("student-cell");
    expect(within(cells[0]).getByText("1")).toBeInTheDocument();
    expect(within(cells[1]).getByText("3")).toBeInTheDocument();
  });

  it("セルは編集画面へのリンクになっている", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 1 });
    renderRoster();

    const cell = await screen.findByRole("link", { name: /1番/ });
    expect(cell).toHaveAttribute("href", `/roster/${student.id}/edit`);
  });
});

describe("氏名の表示設定", () => {
  it("設定がOFFなら氏名を出さない", async () => {
    await addStudent({ cohortId, attendanceNumber: 1, name: "やまだ" });
    renderRoster();

    expect(await screen.findByText("1")).toBeInTheDocument();
    expect(screen.queryByText("やまだ")).not.toBeInTheDocument();
  });

  it("設定がONなら氏名を出す", async () => {
    await setSetting("showStudentNames", true);
    await addStudent({ cohortId, attendanceNumber: 1, name: "やまだ" });
    renderRoster();

    expect(await screen.findByText("やまだ")).toBeInTheDocument();
  });
});

describe("生徒が居ないとき", () => {
  it("空状態の案内を出しグリッドは描かない", async () => {
    renderRoster();

    expect(
      await screen.findByText("まず出席番号を追加してください"),
    ).toBeInTheDocument();
    expect(screen.queryAllByTestId("student-cell")).toHaveLength(0);
  });

  it("初回案内は出さない", async () => {
    renderRoster();
    await screen.findByText("まず出席番号を追加してください");
    expect(
      screen.queryByText("番号をタップすると編集できます"),
    ).not.toBeInTheDocument();
  });
});

describe("初回案内", () => {
  it("生徒が居て未読なら表示する", async () => {
    await addStudent({ cohortId, attendanceNumber: 1 });
    renderRoster();

    expect(
      await screen.findByText("番号をタップすると編集できます"),
    ).toBeInTheDocument();
  });

  it("閉じると消えて設定に記録される", async () => {
    const user = userEvent.setup();
    await addStudent({ cohortId, attendanceNumber: 1 });
    renderRoster();

    await user.click(await screen.findByRole("button", { name: "閉じる" }));

    expect(
      screen.queryByText("番号をタップすると編集できます"),
    ).not.toBeInTheDocument();
    expect(await getSetting("rosterHintDismissed")).toBe(true);
  });

  it("既読なら表示しない", async () => {
    await setSetting("rosterHintDismissed", true);
    await addStudent({ cohortId, attendanceNumber: 1 });
    renderRoster();

    expect(await screen.findByText("1")).toBeInTheDocument();
    expect(
      screen.queryByText("番号をタップすると編集できます"),
    ).not.toBeInTheDocument();
  });
});

describe("下部のボタン", () => {
  it("追加と印刷への導線がある", async () => {
    renderRoster();

    expect(
      await screen.findByRole("link", { name: "生徒を追加" }),
    ).toHaveAttribute("href", "/roster/new");
    expect(screen.getByRole("link", { name: "QRを印刷" })).toHaveAttribute(
      "href",
      "/print",
    );
  });
});
