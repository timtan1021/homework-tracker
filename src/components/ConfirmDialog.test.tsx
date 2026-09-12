import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("やめる・確定どちらのボタンも44px四方以上のタップ領域を確保する", () => {
    render(
      <ConfirmDialog
        title="確認"
        message="よろしいですか"
        confirmLabel="確定する"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "やめる" })).toHaveClass(
      "min-h-11",
    );
    expect(screen.getByRole("button", { name: "確定する" })).toHaveClass(
      "min-h-11",
    );
  });
});
