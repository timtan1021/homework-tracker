import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { AppRoutes } from "../App";
import { createCohort } from "../db/cohorts";
import { addStudent, transferOutStudent } from "../db/students";
import { addSubmissionType, endSubmissionType } from "../db/submissionTypes";
import { listSubmissions } from "../db/submissions";
import { formatDateHeading, toDateKey } from "../lib/date";

useFreshDb();

// 時計は偽装しない。Date.now() を凍結すると Testing Library の waitFor が
// 経過時間を測れなくなり、待ちが壊れる。代わりに実際の今日から曜日を導き、
// 「今日が提出日」「今日は提出日でない」を相対的に作る。
const TODAY = new Date();
const TODAY_KEY = toDateKey(TODAY);
const TODAY_WEEKDAY = TODAY.getDay();
const OTHER_WEEKDAY = (TODAY_WEEKDAY + 1) % 7;

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function addType(name: string, weekdays = [TODAY_WEEKDAY]) {
  return addSubmissionType({ cohortId, name, deadline: "08:15", weekdays });
}

function renderScan() {
  return render(
    <MemoryRouter initialEntries={["/scan"]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("日付と導線", () => {
  it("今日の日付を出す", async () => {
    await addType("計算ドリル");
    renderScan();

    expect(
      await screen.findByText(formatDateHeading(TODAY)),
    ).toBeInTheDocument();
  });

  it("名簿から提出チェックに入れる", async () => {
    const user = userEvent.setup();
    await addType("計算ドリル");

    render(
      <MemoryRouter initialEntries={["/roster"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("link", { name: "提出チェック" }));

    expect(
      await screen.findByText(formatDateHeading(TODAY)),
    ).toBeInTheDocument();
  });
});

describe("提出物の選択", () => {
  it("今日が提出日のものだけ並べる", async () => {
    await addType("計算ドリル", [TODAY_WEEKDAY]);
    await addType("日記", [OTHER_WEEKDAY]); // 今日は提出日でない

    renderScan();

    expect(
      await screen.findByRole("button", { name: /計算ドリル/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /日記/ })).toBeNull();
  });

  it("終了した提出物は並べない", async () => {
    await addType("計算ドリル");
    const ended = await addType("音読カード");
    await endSubmissionType(ended.id);

    renderScan();

    await screen.findByRole("button", { name: /計算ドリル/ });
    expect(screen.queryByRole("button", { name: /音読カード/ })).toBeNull();
  });

  it("最初はすべて選ばれている", async () => {
    await addType("計算ドリル");
    await addType("音読カード");

    renderScan();

    for (const name of [/計算ドリル/, /音読カード/]) {
      expect(await screen.findByRole("button", { name })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
  });

  it("タップで外せる", async () => {
    const user = userEvent.setup();
    await addType("計算ドリル");
    renderScan();

    const toggle = await screen.findByRole("button", { name: /計算ドリル/ });
    await user.click(toggle);

    await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "false"));
  });

  it("今日が提出日のものが無ければその旨を出す", async () => {
    await addType("日記", [OTHER_WEEKDAY]);
    renderScan();

    expect(
      await screen.findByText("今日が提出日の宿題はありません"),
    ).toBeInTheDocument();
  });

  it("提出物が1件も無ければ設定への導線を出す", async () => {
    renderScan();

    expect(
      await screen.findByText("まず提出物を登録してください"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "提出物の設定" }),
    ).toHaveAttribute("href", "/submissions");
  });
});

describe("番号でチェックする", () => {
  it("在籍中の生徒だけ並べる", async () => {
    await addType("計算ドリル");
    await addStudent({ cohortId, attendanceNumber: 1 });
    const out = await addStudent({ cohortId, attendanceNumber: 2 });
    await transferOutStudent(out.id);

    renderScan();

    expect(await screen.findAllByTestId("number-cell")).toHaveLength(1);
  });

  it("番号をタップすると記録され花丸が出る", async () => {
    const user = userEvent.setup();
    await addType("計算ドリル");
    await addStudent({ cohortId, attendanceNumber: 12 });

    renderScan();
    await user.click(await screen.findByRole("button", { name: "12番" }));

    // 中身が入るのを待つ。scan-result は空のときも存在するため、
    // 要素の出現を待つだけでは判定が早すぎる。
    expect(await screen.findByText("提出しました")).toBeInTheDocument();

    const result = screen.getByTestId("scan-result");
    expect(within(result).getByText("12番")).toBeInTheDocument();
    expect(
      within(result).getByRole("img", { name: "提出しました" }),
    ).toBeInTheDocument();

    expect(await listSubmissions(cohortId, TODAY_KEY)).toHaveLength(1);
  });

  it("選択中の提出物すべてに記録する", async () => {
    const user = userEvent.setup();
    await addType("計算ドリル");
    await addType("音読カード");
    await addStudent({ cohortId, attendanceNumber: 12 });

    renderScan();
    await user.click(await screen.findByRole("button", { name: "12番" }));

    await screen.findByTestId("scan-result");
    expect(await listSubmissions(cohortId, TODAY_KEY)).toHaveLength(2);
  });

  it("二度目は提出済みと出し花丸を出さない", async () => {
    const user = userEvent.setup();
    await addType("計算ドリル");
    await addStudent({ cohortId, attendanceNumber: 12 });

    renderScan();
    const cell = await screen.findByRole("button", { name: "12番" });

    await user.click(cell);
    await screen.findByText("提出しました");

    await user.click(cell);
    // 再描画で scan-result の要素が差し替わるため、掴んだ参照は使わず
    // 毎回引き直す。
    expect(await screen.findByText("提出済み")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("scan-result")).queryByRole("img"),
    ).toBeNull();
  });

  it("提出済みの番号に印を付ける", async () => {
    const user = userEvent.setup();
    await addType("計算ドリル");
    await addStudent({ cohortId, attendanceNumber: 12 });

    renderScan();
    await user.click(await screen.findByRole("button", { name: "12番" }));

    await waitFor(() =>
      expect(screen.getAllByTestId("number-cell")[0]).toHaveAttribute(
        "data-done",
        "true",
      ),
    );
  });

  it("提出物を全部外すと記録できない", async () => {
    const user = userEvent.setup();
    await addType("計算ドリル");
    await addStudent({ cohortId, attendanceNumber: 12 });

    renderScan();
    await user.click(await screen.findByRole("button", { name: /計算ドリル/ }));

    expect(
      await screen.findByText("チェックする提出物を選んでください"),
    ).toBeInTheDocument();
    expect(screen.queryAllByTestId("number-cell")).toHaveLength(0);
  });
});

describe("進捗", () => {
  it("提出物ごとの人数を出す", async () => {
    const user = userEvent.setup();
    await addType("計算ドリル");
    await addStudent({ cohortId, attendanceNumber: 1 });
    await addStudent({ cohortId, attendanceNumber: 2 });

    renderScan();
    await user.click(await screen.findByRole("button", { name: "1番" }));

    expect(await screen.findByText("計算ドリル 1人")).toBeInTheDocument();
  });
});
