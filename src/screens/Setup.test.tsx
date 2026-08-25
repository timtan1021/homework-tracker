import { useFreshDb } from "../test/db";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AppRoutes } from "../App";
import { getActiveCohort } from "../db/cohorts";
import type { BackupFile } from "../backup/types";

useFreshDb();

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("初回セットアップ", () => {
  it("cohortが無いとき名簿を開くとセットアップに送られる", async () => {
    renderAt("/roster");
    expect(
      await screen.findByRole("heading", { name: "クラスをつくる" }),
    ).toBeInTheDocument();
  });

  it("年度の初期値が現在の学校年度になっている", async () => {
    renderAt("/setup");
    const year = await screen.findByLabelText("年度");
    expect(year).toHaveValue(2026);
  });

  it("クラス名が空なら保存せずエラーを出す", async () => {
    const user = userEvent.setup();
    renderAt("/setup");

    await user.click(await screen.findByRole("button", { name: "クラスをつくる" }));

    expect(await screen.findByText("クラス名を入力してください")).toBeInTheDocument();
    expect(await getActiveCohort()).toBeNull();
  });

  it("年度が空なら保存せずエラーを出す", async () => {
    const user = userEvent.setup();
    renderAt("/setup");

    await user.clear(await screen.findByLabelText("年度"));
    await user.type(await screen.findByLabelText("クラス名"), "5年1組");
    await user.click(screen.getByRole("button", { name: "クラスをつくる" }));

    expect(
      await screen.findByText("年度は2000から2100までの数字で入力してください"),
    ).toBeInTheDocument();
    expect(await getActiveCohort()).toBeNull();
  });

  it("入力して保存するとcohortが作られ名簿に移る", async () => {
    const user = userEvent.setup();
    renderAt("/setup");

    await user.type(await screen.findByLabelText("クラス名"), "5年1組");
    await user.click(screen.getByRole("button", { name: "クラスをつくる" }));

    expect(await screen.findByText("2026年度 5年1組")).toBeInTheDocument();

    const cohort = await getActiveCohort();
    expect(cohort?.className).toBe("5年1組");
    expect(cohort?.year).toBe(2026);
  });
});

describe("バックアップからの復元", () => {
  it("ファイルを選ぶと確認無しで復元される", async () => {
    const user = userEvent.setup();

    // /setup に到達できるのは有効なcohortが無いときだけ（SetupGateによる）。
    // buildBackup はDBから組み立てる純粋関数でルーティングを経由しないため、
    // BackupFile 形式のオブジェクトをここで直接組み立てる。
    const backup: BackupFile = {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      cohort: {
        id: "cohort-from-backup",
        year: 2026,
        className: "5年1組",
        isActive: true,
        createdAt: Date.now(),
      },
      students: [
        {
          id: "student-from-backup",
          cohortId: "cohort-from-backup",
          attendanceNumber: 3,
          name: "",
          status: "active",
          createdAt: Date.now(),
        },
      ],
      submissionTypes: [],
      submissions: [],
    };

    renderAt("/setup");

    const input = await screen.findByLabelText("復元するファイル");
    const file = new File([JSON.stringify(backup)], "backup.json", {
      type: "application/json",
    });
    await user.upload(input, file);

    // 確認ダイアログを経ずに、そのまま名簿へ遷移する
    expect(await screen.findByText("在籍1人・欠番0")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("壊れたファイルを選ぶとエラーを出す", async () => {
    const user = userEvent.setup();
    renderAt("/setup");

    const input = await screen.findByLabelText("復元するファイル");
    const file = new File(["{ 壊れたJSON"], "backup.json", {
      type: "application/json",
    });
    await user.upload(input, file);

    expect(
      await screen.findByText(
        "このファイルは読み込めませんでした。バックアップファイルを選び直してください",
      ),
    ).toBeInTheDocument();

    // エラー後もファイル選択が固まらず、別のファイルを選び直せること
    await waitFor(() => expect(input).toBeEnabled());
  });
});
