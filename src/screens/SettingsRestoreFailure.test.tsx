import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFreshDb } from "../test/db";
import { createCohort } from "../db/cohorts";

// 復元の完了タイミングをテストから制御するため、Promiseを外に出す。
// 「復元中」の一瞬をテストするには、その瞬間で処理を止められないと
// いけない。復元だけを失敗させる。書き出し・検証は本物のままにする。
let rejectRestore: (() => void) | null = null;

vi.mock("../backup/import", async () => {
  const actual =
    await vi.importActual<typeof import("../backup/import")>(
      "../backup/import",
    );
  return {
    ...actual,
    restoreBackup: vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectRestore = () => reject(new Error("書き込みに失敗しました"));
        }),
    ),
  };
});

const { Settings } = await import("./Settings");

useFreshDb();

beforeEach(async () => {
  rejectRestore = null;
  await createCohort({ year: 2026, className: "5年1組" });
});

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <Settings />
    </MemoryRouter>,
  );
}

async function uploadValidBackup(user: ReturnType<typeof userEvent.setup>) {
  const input = await screen.findByLabelText("復元するファイル");
  const backup = {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    cohort: {
      id: "cohort-from-backup",
      year: 2025,
      className: "4年1組",
      isActive: true,
      createdAt: Date.now(),
    },
    students: [],
    submissionTypes: [],
    submissions: [],
  };
  const file = new File([JSON.stringify(backup)], "backup.json", {
    type: "application/json",
  });
  await user.upload(input, file);
}

describe("復元に失敗したとき", () => {
  it("復元中は確認ダイアログが消え、押せるボタンが無い状態になる", async () => {
    const user = userEvent.setup();
    renderSettings();

    await uploadValidBackup(user);

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "復元する" }));

    // 復元が終わっていないこの時点で、確認ダイアログの「やめる」を
    // 押せてしまうと、処理を止められると誤解させる。ダイアログごと
    // 消えている必要がある。
    expect(await screen.findByText("復元しています")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).toBeNull();

    rejectRestore?.();
    await screen.findByText("復元できませんでした。もう一度お試しください");
  });

  it("失敗すると次にどうするかを伝えて選び直せる状態に戻る", async () => {
    const user = userEvent.setup();
    renderSettings();

    await uploadValidBackup(user);

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "復元する" }));

    rejectRestore?.();

    expect(
      await screen.findByText("復元できませんでした。もう一度お試しください"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).toBeNull();

    const retryInput = screen.getByLabelText("復元するファイル");
    await waitFor(() => expect(retryInput).toBeEnabled());
  });
});
