import { useFreshDb } from "../test/db";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderAsTeacher } from "../test/router";
import { createCohort } from "../db/cohorts";
import { addDateSubmission, listDateSubmissionsInWeek } from "../db/dateSubmissions";
import * as dateSubmissionsModule from "../db/dateSubmissions";
import { setDefaultDeadline } from "../db/settings";
import { startOfWeek, toDateKey } from "../lib/date";

useFreshDb();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function renderAt(path: string) {
  return renderAsTeacher(path);
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

  it("31文字目からは入力できない", async () => {
    const user = userEvent.setup();
    renderAt("/calendar");

    const buttons = await screen.findAllByRole("button", {
      name: "タップして登録",
    });
    await user.click(buttons[0]);

    const input = await screen.findByRole("textbox");
    await user.type(input, "あ".repeat(31));

    expect(input).toHaveValue("あ".repeat(30));
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
    // 削除ボタンはaria-labelで対象の宿題名を含むaccessible nameを持つ
    // (同じ週に複数の削除ボタンが並んでも、スクリーンリーダー利用者が
    // どの項目のボタンかを区別できるようにするため)。
    await user.click(
      await screen.findByRole("button", { name: "削除する宿題を削除" }),
    );
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

  it("登録の保存に失敗したらエラーを表示する", async () => {
    const user = userEvent.setup();
    const spy = vi
      .spyOn(dateSubmissionsModule, "addDateSubmission")
      .mockRejectedValueOnce(new Error("ストレージにアクセスできません"));

    renderAt("/calendar");

    const buttons = await screen.findAllByRole("button", {
      name: "タップして登録",
    });
    await user.click(buttons[0]);
    const input = await screen.findByRole("textbox");
    await user.type(input, "保存できない宿題");
    fireEvent.blur(input);

    expect(
      await screen.findByText("ストレージにアクセスできません"),
    ).toBeInTheDocument();
    // 失敗した項目は残らない(入力欄は閉じたまま、一覧にも追加されない)
    expect(screen.queryByText("保存できない宿題")).toBeNull();

    spy.mockRestore();
  });

  it("削除の保存に失敗したらエラーを表示し、項目は残る", async () => {
    const user = userEvent.setup();
    const weekStart = startOfWeek(toDateKey(new Date()));
    await addDateSubmission({
      cohortId,
      name: "消せない宿題",
      date: weekStart,
      deadline: "08:15",
    });

    const spy = vi
      .spyOn(dateSubmissionsModule, "deleteDateSubmission")
      .mockRejectedValueOnce(new Error("ストレージにアクセスできません"));

    renderAt("/calendar");

    await screen.findByText("消せない宿題");
    await user.click(
      await screen.findByRole("button", { name: "消せない宿題を削除" }),
    );
    await user.click(await screen.findByRole("button", { name: "削除する" }));

    expect(
      await screen.findByText("ストレージにアクセスできません"),
    ).toBeInTheDocument();
    expect(screen.getByText("消せない宿題")).toBeInTheDocument();

    spy.mockRestore();
  });

  it("週を送って戻っても、空欄エラーの入力欄が再び開かない", async () => {
    const user = userEvent.setup();
    renderAt("/calendar");

    // 最初の日をタップして未入力のままblurし、空欄エラーを出す。
    // このとき editing は早期リターンでnullに戻らず残ったままになる。
    const buttons = await screen.findAllByRole("button", {
      name: "タップして登録",
    });
    await user.click(buttons[0]);
    const input = await screen.findByRole("textbox");
    fireEvent.blur(input);
    expect(
      await screen.findByText("宿題の名前を入力してください"),
    ).toBeInTheDocument();

    // 次週へ進み、前週へ戻る。教師は何も入力していない。
    await user.click(await screen.findByRole("button", { name: "次週 →" }));
    await user.click(await screen.findByRole("button", { name: "← 前週" }));

    // 元の週の最初の日が、空欄エラーもテキストボックスも持たない
    // 「タップして登録」の状態に戻っていること。
    expect(
      screen.queryByText("宿題の名前を入力してください"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      (
        await screen.findAllByRole("button", { name: "タップして登録" })
      )[0],
    ).toBeInTheDocument();
  });
});
