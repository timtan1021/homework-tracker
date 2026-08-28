import { useFreshDb } from "../test/db";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { AppRoutes } from "../App";
import { createCohort, getActiveCohort } from "../db/cohorts";
import { getDefaultDeadline, getSetting } from "../db/settings";
import { addStudent } from "../db/students";
import type { BackupFile } from "../backup/types";

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

describe("設定画面", () => {
  it("氏名を表示するトグルが最初はOFF", async () => {
    renderAt("/settings");
    expect(await screen.findByRole("checkbox", { name: "氏名を表示する" })).not.toBeChecked();
  });

  it("トグルを入れると保存される", async () => {
    const user = userEvent.setup();
    renderAt("/settings");

    const checkbox = await screen.findByRole("checkbox", { name: "氏名を表示する" });
    await waitFor(() => expect(checkbox).toBeEnabled());
    await user.click(checkbox);

    expect(await getSetting("showStudentNames")).toBe(true);
  });

  it("共通締切時刻を変更できる", async () => {
    renderAt("/settings");

    const input = await screen.findByLabelText("日付指定の宿題の共通締切時刻");
    await waitFor(() => expect(input).toBeEnabled());

    fireEvent.change(input, { target: { value: "09:00" } });

    await waitFor(async () => {
      expect(await getDefaultDeadline()).toBe("09:00");
    });
  });

  it("名簿から設定に入れる", async () => {
    const user = userEvent.setup();
    renderAt("/roster");

    await user.click(await screen.findByRole("link", { name: "設定" }));

    expect(
      await screen.findByRole("heading", { name: "設定" }),
    ).toBeInTheDocument();
  });
});

describe("氏名の表示は名簿と印刷の両方に効く", () => {
  it("ONにすると名簿に氏名が出る", async () => {
    const user = userEvent.setup();
    await addStudent({ cohortId, attendanceNumber: 1, name: "やまだ" });

    renderAt("/settings");
    const rosterCheckbox = await screen.findByRole("checkbox", { name: "氏名を表示する" });
    await waitFor(() => expect(rosterCheckbox).toBeEnabled());
    await user.click(rosterCheckbox);
    await user.click(screen.getByRole("link", { name: "名簿に戻る" }));

    expect(await screen.findByText("やまだ")).toBeInTheDocument();
  });

  it("ONにすると印刷シートに氏名が出る", async () => {
    const user = userEvent.setup();
    await addStudent({ cohortId, attendanceNumber: 1, name: "やまだ" });

    renderAt("/settings");
    const printCheckbox = await screen.findByRole("checkbox", { name: "氏名を表示する" });
    await waitFor(() => expect(printCheckbox).toBeEnabled());
    await user.click(printCheckbox);
    await user.click(screen.getByRole("link", { name: "名簿に戻る" }));
    await user.click(await screen.findByRole("link", { name: "QRを印刷" }));

    expect(await screen.findByText("やまだ")).toBeInTheDocument();
  });
});

describe("バックアップの書き出し", () => {
  it("書き出しボタンがある", async () => {
    renderAt("/settings");

    expect(
      await screen.findByRole("button", { name: "バックアップを書き出す" }),
    ).toBeInTheDocument();
  });
});

/**
 * 復元用のバックアップをDBに実在させず、直接オブジェクトとして組み立てる。
 *
 * createCohort を呼ぶとその場でアクティブになり、beforeEach で作った
 * 5年1組が無効化されてしまう。復元前の「現在のデータ」を5年1組のまま
 * 保つため、バックアップの中身はDBに書き込まずに用意する。
 */
function fakeBackup(overrides: Partial<BackupFile["cohort"]> = {}): BackupFile {
  return {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    cohort: {
      id: "cohort-from-backup",
      year: 2025,
      className: "4年1組",
      isActive: true,
      createdAt: Date.now(),
      ...overrides,
    },
    students: [],
    submissionTypes: [],
    submissions: [],
  };
}

describe("復元", () => {
  it("ファイルを選ぶと確認ダイアログが出る", async () => {
    const user = userEvent.setup();
    const backup = fakeBackup();

    renderAt("/settings");

    const input = await screen.findByLabelText("復元するファイル");
    const file = new File([JSON.stringify(backup)], "backup.json", {
      type: "application/json",
    });
    await user.upload(input, file);

    // 確認ダイアログに出るのは「現在の」データ（beforeEach で作った
    // 5年1組）であって、選んだファイルの中身ではない。
    expect(
      await screen.findByText(
        "現在のデータ（2026年度 5年1組）を消して、選んだファイルの内容に置き換えます。元に戻せません。",
      ),
    ).toBeInTheDocument();
  });

  it("確認すると復元される", async () => {
    const user = userEvent.setup();
    const backup = fakeBackup();

    renderAt("/settings");

    const input = await screen.findByLabelText("復元するファイル");
    const file = new File([JSON.stringify(backup)], "backup.json", {
      type: "application/json",
    });
    await user.upload(input, file);

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "復元する" }));

    // location.reload は jsdom では実際には遷移しないため、
    // 画面の見た目ではなく DB の状態で確認する。復元前の唯一の
    // アクティブクラスは 5年1組 なので、4年1組 になっていれば
    // restoreBackup が実際に効いたことになる。
    await waitFor(async () => {
      const active = await getActiveCohort();
      expect(active?.className).toBe("4年1組");
    });
  });

  it("取り消せば何も変わらない", async () => {
    const user = userEvent.setup();
    const backup = fakeBackup();

    renderAt("/settings");

    const input = await screen.findByLabelText("復元するファイル");
    const file = new File([JSON.stringify(backup)], "backup.json", {
      type: "application/json",
    });
    await user.upload(input, file);

    await user.click(await screen.findByRole("button", { name: "やめる" }));

    // 元々 beforeEach で作った 5年1組 のまま
    const active = await getActiveCohort();
    expect(active?.className).toBe("5年1組");
  });

  it("壊れたファイルを選ぶとエラーを出し復元しない", async () => {
    const user = userEvent.setup();
    renderAt("/settings");

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
    expect(screen.queryByRole("alertdialog")).toBeNull();

    const active = await getActiveCohort();
    expect(active?.className).toBe("5年1組");
  });
});
