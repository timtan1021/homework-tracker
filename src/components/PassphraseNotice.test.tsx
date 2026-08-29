import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PassphraseNotice } from "./PassphraseNotice";

describe("PassphraseNotice", () => {
  it("合言葉を表示する", () => {
    render(
      <PassphraseNotice passphrase="あめ-そら-ほし-つき" onDone={() => {}} />,
    );

    expect(screen.getByText("あめ-そら-ほし-つき")).toBeInTheDocument();
  });

  it("控えるまで先へ進めない", () => {
    render(
      <PassphraseNotice passphrase="あめ-そら-ほし-つき" onDone={() => {}} />,
    );

    expect(screen.getByRole("button", { name: "はじめる" })).toBeDisabled();
  });

  it("控えたことを確認すると先へ進める", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(
      <PassphraseNotice passphrase="あめ-そら-ほし-つき" onDone={onDone} />,
    );

    await user.click(screen.getByRole("checkbox", { name: "紙に控えました" }));
    await user.click(screen.getByRole("button", { name: "はじめる" }));

    expect(onDone).toHaveBeenCalledOnce();
  });

  it("二度と表示できないことを伝える", () => {
    render(
      <PassphraseNotice passphrase="あめ-そら-ほし-つき" onDone={() => {}} />,
    );

    expect(
      screen.getByText(/この画面を閉じると二度と表示できません/),
    ).toBeInTheDocument();
  });
});
