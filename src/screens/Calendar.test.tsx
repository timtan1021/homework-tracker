import { useFreshDb } from "../test/db";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { AppRoutes } from "../App";
import { createCohort } from "../db/cohorts";
import { addDateSubmission, listDateSubmissionsInWeek } from "../db/dateSubmissions";
import { setDefaultDeadline } from "../db/settings";
import { startOfWeek, toDateKey } from "../lib/date";

useFreshDb();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("カレンダー画面", () => {
  it("今週の日付が7日ぶん並ぶ", async () => {
    renderAt("/calendar");

    const weekStart = startOfWeek(toDateKey(new Date()));
    const [year, month, day] = weekStart.split("-").map(Number);
    const start = new Date(year, month - 1, day);

    for (let i = 0; i < 7; i++) {
      const current = new Date(start);
      current.setDate(current.getDate() + i);
      const label = `${current.getMonth() + 1}月${current.getDate()}日`;
      expect(await screen.findByText(new RegExp(label))).toBeInTheDocument();
    }
  });

  it("未登録の日をタップして宿題名を登録できる", async () => {
    const user = userEvent.setup();
    renderAt("/calendar");

    const buttons = await screen.findAllByRole("button", {
      name: "タップして登録",
    });
    await user.click(buttons[0]);

    const input = await screen.findByRole("textbox");
    await user.type(input, "計算プリントp23");
    fireEvent.blur(input);

    expect(await screen.findByText("計算プリントp23")).toBeInTheDocument();
  });

  it("空欄のまま確定しようとするとエラーを出し登録しない", async () => {
    const user = userEvent.setup();
    renderAt("/calendar");

    const buttons = await screen.findAllByRole("button", {
      name: "タップして登録",
    });
    await user.click(buttons[0]);

    const input = await screen.findByRole("textbox");
    fireEvent.blur(input); // 何も入力せずblur

    expect(
      await screen.findByText("宿題の名前を入力してください"),
    ).toBeInTheDocument();
  });

  it("登録済みの項目をタップして名前を編集できる", async () => {
    const user = userEvent.setup();
    const weekStart = startOfWeek(toDateKey(new Date()));
    await addDateSubmission({
      cohortId,
      name: "元の名前",
      date: weekStart,
      deadline: "08:15",
    });

    renderAt("/calendar");

    await user.click(await screen.findByText("元の名前"));
    const input = await screen.findByRole("textbox");
    fireEvent.change(input, { target: { value: "新しい名前" } });
    fireEvent.blur(input);

    expect(await screen.findByText("新しい名前")).toBeInTheDocument();
  });

  it("削除の確認ダイアログを経て項目を削除できる", async () => {
    const user = userEvent.setup();
    const weekStart = startOfWeek(toDateKey(new Date()));
    await addDateSubmission({
      cohortId,
      name: "削除する宿題",
      date: weekStart,
      deadline: "08:15",
    });

    renderAt("/calendar");

    await screen.findByText("削除する宿題");
    await user.click(await screen.findByRole("button", { name: "削除" }));
    await user.click(await screen.findByRole("button", { name: "削除する" }));

    // 削除はConfirmDialogのonConfirmから発火する非同期処理(delete→reload)なので、
    // クリックの直後ではなく描画が更新されるまで待つ。1回だけ見て判定しない。
    await waitFor(() => {
      expect(screen.queryByText("削除する宿題")).toBeNull();
    });
  });

  it("次週・前週で表示が切り替わる", async () => {
    const user = userEvent.setup();
    const weekStart = startOfWeek(toDateKey(new Date()));
    const [year, month, day] = weekStart.split("-").map(Number);
    const nextWeekStartDate = new Date(year, month - 1, day + 7);
    const nextWeekKey = toDateKey(nextWeekStartDate);

    await addDateSubmission({
      cohortId,
      name: "来週の宿題",
      date: nextWeekKey,
      deadline: "08:15",
    });

    renderAt("/calendar");

    expect(screen.queryByText("来週の宿題")).toBeNull();

    await user.click(await screen.findByRole("button", { name: "次週 →" }));

    expect(await screen.findByText("来週の宿題")).toBeInTheDocument();
  });

  it("設定画面の共通締切時刻を新規登録に使う", async () => {
    const user = userEvent.setup();
    await setDefaultDeadline("09:00");
    const weekStart = startOfWeek(toDateKey(new Date()));

    renderAt("/calendar");

    const buttons = await screen.findAllByRole("button", {
      name: "タップして登録",
    });
    await user.click(buttons[0]);
    const input = await screen.findByRole("textbox");
    await user.type(input, "登録テスト宿題");
    fireEvent.blur(input);

    await screen.findByText("登録テスト宿題");
    const list = await listDateSubmissionsInWeek(cohortId, [weekStart]);
    expect(list[0].deadline).toBe("09:00");
  });
});
