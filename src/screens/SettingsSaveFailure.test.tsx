import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFreshDb } from "../test/db";
import { createCohort } from "../db/cohorts";

// 保存だけを失敗させる。読み取りは本物のままにして、
// 初回読み込みが終わってからトグルを押せる状態を保つ。
vi.mock("../db/settings", async () => {
  const actual =
    await vi.importActual<typeof import("../db/settings")>("../db/settings");
  return {
    ...actual,
    setSetting: vi.fn().mockRejectedValue(new Error("書き込みに失敗しました")),
  };
});

const { Settings } = await import("./Settings");

useFreshDb();

beforeEach(async () => {
  await createCohort({ year: 2026, className: "5年1組" });
});

describe("設定の保存に失敗したとき", () => {
  it("トグルを元に戻し、何が起きたかと次にどうするかを伝える", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Settings />
      </MemoryRouter>,
    );

    const checkbox = await screen.findByRole("checkbox", {
      name: "氏名を表示する",
    });
    await waitFor(() => expect(checkbox).toBeEnabled());
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);

    expect(
      await screen.findByText(
        "設定を保存できませんでした。もう一度切り替えてください",
      ),
    ).toBeInTheDocument();

    // 楽観的に入れた値が戻っていること。戻らないと
    // 「保存されているのに反映されない設定」に見える。
    await waitFor(() => expect(checkbox).not.toBeChecked());
  });
});
