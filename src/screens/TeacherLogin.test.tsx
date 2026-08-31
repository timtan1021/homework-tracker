import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFreshDb } from "../test/db";
import { setTeacherPassword, verifyTeacherPassword } from "../db/teacherAuth";
import { TeacherLogin } from "./TeacherLogin";

useFreshDb();

let passphrase = "";

beforeEach(async () => {
  passphrase = await setTeacherPassword("あさのかい");
});

describe("パスワードで入る", () => {
  it("正しいパスワードで onSuccess を呼ぶ", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(<TeacherLogin onSuccess={onSuccess} onExit={() => {}} />);

    await user.type(screen.getByLabelText("パスワード"), "あさのかい");
    await user.click(screen.getByRole("button", { name: "入る" }));

    await vi.waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });
  });

  it("違うパスワードでは onSuccess を呼ばない", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(<TeacherLogin onSuccess={onSuccess} onExit={() => {}} />);

    await user.type(screen.getByLabelText("パスワード"), "ちがう");
    await user.click(screen.getByRole("button", { name: "入る" }));

    expect(
      await screen.findByText("パスワードが違います"),
    ).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("入力欄はパスワードとして扱う", () => {
    render(<TeacherLogin onSuccess={() => {}} onExit={() => {}} />);

    expect(screen.getByLabelText("パスワード")).toHaveAttribute(
      "type",
      "password",
    );
  });

  it("こどもがめんへ戻れる", async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();
    render(<TeacherLogin onSuccess={() => {}} onExit={onExit} />);

    await user.click(screen.getByRole("button", { name: "← こどもがめんへ" }));

    expect(onExit).toHaveBeenCalledOnce();
  });
});

describe("合言葉で決め直す", () => {
  async function openRecovery(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      screen.getByRole("button", { name: "パスワードを忘れたとき" }),
    );
  }

  async function submitRecovery(
    user: ReturnType<typeof userEvent.setup>,
    phrase: string,
    next: string,
  ) {
    await user.type(screen.getByLabelText("合言葉"), phrase);
    await user.type(screen.getByLabelText("新しいパスワード"), next);
    await user.click(screen.getByRole("button", { name: "決め直す" }));
  }

  it("正しい合言葉で新しいパスワードに変わる", async () => {
    const user = userEvent.setup();
    render(<TeacherLogin onSuccess={() => {}} onExit={() => {}} />);

    await openRecovery(user);
    await submitRecovery(user, passphrase, "あたらしい");

    expect(
      await screen.findByText("合言葉を控えてください"),
    ).toBeInTheDocument();
    expect(await verifyTeacherPassword("あたらしい")).toBe(true);
  });

  it("新しい合言葉を控えてから onSuccess を呼ぶ", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(<TeacherLogin onSuccess={onSuccess} onExit={() => {}} />);

    await openRecovery(user);
    await submitRecovery(user, passphrase, "あたらしい");
    await screen.findByText("合言葉を控えてください");

    expect(onSuccess).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", { name: "紙に控えました" }));
    await user.click(screen.getByRole("button", { name: "はじめる" }));

    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("違う合言葉では変わらない", async () => {
    const user = userEvent.setup();
    render(<TeacherLogin onSuccess={() => {}} onExit={() => {}} />);

    await openRecovery(user);
    await submitRecovery(user, "あめ-そら-ほし-つき", "あたらしい");

    expect(
      await screen.findByText(
        "合言葉が違います。控えた紙のとおりに入力してください",
      ),
    ).toBeInTheDocument();
    expect(await verifyTeacherPassword("あさのかい")).toBe(true);
  });

  it("新しいパスワードが4文字未満なら断る", async () => {
    const user = userEvent.setup();
    render(<TeacherLogin onSuccess={() => {}} onExit={() => {}} />);

    await openRecovery(user);
    await submitRecovery(user, passphrase, "abc");

    expect(
      await screen.findByText("パスワードは4文字以上にしてください"),
    ).toBeInTheDocument();
    expect(await verifyTeacherPassword("あさのかい")).toBe(true);
  });

  it("パスワード入力に戻れる", async () => {
    const user = userEvent.setup();
    render(<TeacherLogin onSuccess={() => {}} onExit={() => {}} />);

    await openRecovery(user);
    await user.click(screen.getByRole("button", { name: "やめる" }));

    expect(screen.getByLabelText("パスワード")).toBeInTheDocument();
  });

  // 合言葉は一度しか出ない。ここに離脱口があると控える前に消せてしまう。
  it("合言葉の控え画面には こどもがめんへ を出さない", async () => {
    const user = userEvent.setup();
    render(<TeacherLogin onSuccess={() => {}} onExit={() => {}} />);

    await openRecovery(user);
    await submitRecovery(user, passphrase, "あたらしい");
    await screen.findByText("合言葉を控えてください");

    expect(
      screen.queryByRole("button", { name: "← こどもがめんへ" }),
    ).not.toBeInTheDocument();
  });
});
