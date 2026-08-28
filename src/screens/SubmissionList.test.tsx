import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { AppRoutes } from "../App";
import { createCohort } from "../db/cohorts";
import {
  addSubmissionType,
  endSubmissionType,
  listSubmissionTypes,
} from "../db/submissionTypes";
import { addDateSubmission } from "../db/dateSubmissions";

useFreshDb();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function add(name: string, weekdays = [1, 2, 3, 4, 5], deadline = "08:15") {
  return addSubmissionType({ cohortId, name, deadline, weekdays });
}

function renderList() {
  return render(
    <MemoryRouter initialEntries={["/submissions"]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("ヘッダー", () => {
  it("年度とクラス名を出す", async () => {
    renderList();

    expect(await screen.findByText("2026年度 5年1組")).toBeInTheDocument();
  });

  it("有効な件数と終了した件数を出す", async () => {
    await add("計算ドリル");
    await add("音読カード");
    const ended = await add("日記");
    await endSubmissionType(ended.id);

    renderList();

    expect(await screen.findByText("提出物2件・終了1")).toBeInTheDocument();
  });
});

describe("一覧", () => {
  it("名前・締切・曜日を出す", async () => {
    await add("計算ドリル");
    renderList();

    const row = (await screen.findAllByTestId("submission-row"))[0];
    expect(within(row).getByText("計算ドリル")).toBeInTheDocument();
    expect(within(row).getByText("08:15")).toBeInTheDocument();
    expect(within(row).getByText("月火水木金")).toBeInTheDocument();
  });

  it("すべての曜日なら毎日と出す", async () => {
    await add("音読カード", [0, 1, 2, 3, 4, 5, 6]);
    renderList();

    expect(await screen.findByText("毎日")).toBeInTheDocument();
  });

  it("有効と終了を描き分ける", async () => {
    await add("計算ドリル");
    const ended = await add("日記");
    await endSubmissionType(ended.id);

    renderList();

    const rows = await screen.findAllByTestId("submission-row");
    expect(rows[0]).toHaveAttribute("data-status", "active");
    expect(rows[1]).toHaveAttribute("data-status", "ended");
  });

  it("終了したものに（終了）を添える", async () => {
    const ended = await add("日記");
    await endSubmissionType(ended.id);

    renderList();

    expect(await screen.findByText(/日記（終了）/)).toBeInTheDocument();
  });

  it("行が編集画面へのリンクになっている", async () => {
    const type = await add("計算ドリル");
    renderList();

    const link = await screen.findByRole("link", { name: /計算ドリル/ });
    expect(link).toHaveAttribute("href", `/submissions/${type.id}/edit`);
  });
});

describe("並べ替え", () => {
  it("下へ押すと順番が入れ替わる", async () => {
    const user = userEvent.setup();
    await add("計算ドリル");
    await add("音読カード");
    renderList();

    const rows = await screen.findAllByTestId("submission-row");
    await user.click(within(rows[0]).getByRole("button", { name: "下へ" }));

    const names = (await listSubmissionTypes(cohortId)).map((t) => t.name);
    expect(names).toEqual(["音読カード", "計算ドリル"]);
  });

  it("先頭の「上へ」は押せない", async () => {
    await add("計算ドリル");
    await add("音読カード");
    renderList();

    const rows = await screen.findAllByTestId("submission-row");
    expect(within(rows[0]).getByRole("button", { name: "上へ" })).toBeDisabled();
  });

  it("末尾の「下へ」は押せない", async () => {
    await add("計算ドリル");
    await add("音読カード");
    renderList();

    const rows = await screen.findAllByTestId("submission-row");
    expect(within(rows[1]).getByRole("button", { name: "下へ" })).toBeDisabled();
  });

  it("終了したものに並べ替えボタンを出さない", async () => {
    const ended = await add("日記");
    await endSubmissionType(ended.id);
    renderList();

    const rows = await screen.findAllByTestId("submission-row");
    expect(within(rows[0]).queryByRole("button", { name: "上へ" })).toBeNull();
    expect(within(rows[0]).queryByRole("button", { name: "下へ" })).toBeNull();
  });
});

describe("提出物が無いとき", () => {
  it("空状態の案内を出す", async () => {
    renderList();

    expect(
      await screen.findByText("まず提出物を追加してください"),
    ).toBeInTheDocument();
    expect(screen.queryAllByTestId("submission-row")).toHaveLength(0);
  });
});

describe("導線", () => {
  it("追加への導線がある", async () => {
    renderList();

    expect(
      await screen.findByRole("link", { name: "提出物を追加" }),
    ).toHaveAttribute("href", "/submissions/new");
  });

  it("名簿から提出物の設定に入れる", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/roster"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("link", { name: "提出物の設定" }));

    expect(await screen.findByText("提出物0件・終了0")).toBeInTheDocument();
  });
});

it("日付指定の提出物は一覧に出さない", async () => {
  await add("毎週の宿題");
  await addDateSubmission({
    cohortId,
    name: "日付指定の宿題",
    date: "2026-09-01",
    deadline: "08:15",
  });

  renderList();

  await screen.findByText("毎週の宿題");
  expect(screen.queryByText("日付指定の宿題")).toBeNull();
});
