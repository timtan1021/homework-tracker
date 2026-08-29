import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useFreshDb } from "../test/db";
import { isTeacherPasswordSet, verifyTeacherPassword } from "../db/teacherAuth";
import { TeacherPasswordSetup } from "./TeacherPasswordSetup";

useFreshDb();

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  password: string,
  confirm: string,
) {
  await user.type(screen.getByLabelText("パスワード"), password);
  await user.type(screen.getByLabelText("パスワード（もう一度）"), confirm);
  await user.click(screen.getByRole("button", { name: "決定" }));
}

describe("TeacherPasswordSetup", () => {
  it("パスワードを設定すると合言葉が出る", async () => {
    const user = userEvent.setup();
    render(<TeacherPasswordSetup onDone={() => {}} />);

    await fillAndSubmit(user, "あさのかい", "あさのかい");

    expect(
      await screen.findByText("合言葉を控えてください"),
    ).toBeInTheDocument();
  });

  it("設定したパスワードで通るようになる", async () => {
    const user = userEvent.setup();
    render(<TeacherPasswordSetup onDone={() => {}} />);

    await fillAndSubmit(user, "あさのかい", "あさのかい");
    await screen.findByText("合言葉を控えてください");

    expect(await verifyTeacherPassword("あさのかい")).toBe(true);
  });

  it("合言葉を控えてから onDone を呼ぶ", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<TeacherPasswordSetup onDone={onDone} />);

    await fillAndSubmit(user, "あさのかい", "あさのかい");
    await screen.findByText("合言葉を控えてください");

    await user.click(screen.getByRole("checkbox", { name: "紙に控えました" }));
    await user.click(screen.getByRole("button", { name: "はじめる" }));

    expect(onDone).toHaveBeenCalledOnce();
  });

  it("2回の入力が違うと保存しない", async () => {
    const user = userEvent.setup();
    render(<TeacherPasswordSetup onDone={() => {}} />);

    await fillAndSubmit(user, "あさのかい", "あさのかー");

    expect(
      await screen.findByText("同じパスワードをもう一度入力してください"),
    ).toBeInTheDocument();
    expect(await isTeacherPasswordSet()).toBe(false);
  });

  it("4文字未満は保存しない", async () => {
    const user = userEvent.setup();
    render(<TeacherPasswordSetup onDone={() => {}} />);

    await fillAndSubmit(user, "abc", "abc");

    expect(
      await screen.findByText("パスワードは4文字以上にしてください"),
    ).toBeInTheDocument();
    expect(await isTeacherPasswordSet()).toBe(false);
  });

  it("入力欄はパスワードとして扱う", async () => {
    render(<TeacherPasswordSetup onDone={() => {}} />);

    expect(screen.getByLabelText("パスワード")).toHaveAttribute(
      "type",
      "password",
    );
    expect(screen.getByLabelText("パスワード（もう一度）")).toHaveAttribute(
      "type",
      "password",
    );
  });

  it("保存中は二重に押せない", async () => {
    const user = userEvent.setup();
    render(<TeacherPasswordSetup onDone={() => {}} />);

    await user.type(screen.getByLabelText("パスワード"), "あさのかい");
    await user.type(
      screen.getByLabelText("パスワード（もう一度）"),
      "あさのかい",
    );
    await user.click(screen.getByRole("button", { name: "決定" }));

    // PBKDF2 の計算中はボタンが無効になる。再描画で要素が差し替わるため
    // 掴んだ参照を使い回さず、waitFor の中で毎回引き直す。
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "決定" })).toBeDisabled();
    });
  });
});
