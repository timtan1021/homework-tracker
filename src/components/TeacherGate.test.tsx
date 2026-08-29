import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFreshDb } from "../test/db";
import { setTeacherPassword } from "../db/teacherAuth";
import { TeacherAuthProvider } from "./TeacherAuthProvider";
import { TeacherGate } from "./TeacherGate";

useFreshDb();

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderGate() {
  return render(
    <TeacherAuthProvider>
      <TeacherGate>
        <p>名簿の中身</p>
      </TeacherGate>
    </TeacherAuthProvider>,
  );
}

describe("パスワード未設定のとき", () => {
  it("設定画面を出す", async () => {
    renderGate();

    expect(
      await screen.findByText("先生用のパスワードを決めてください"),
    ).toBeInTheDocument();
  });

  it("中身を見せない", async () => {
    renderGate();

    await screen.findByText("先生用のパスワードを決めてください");
    expect(screen.queryByText("名簿の中身")).not.toBeInTheDocument();
  });

  it("設定を最後まで終えると中身が出る", async () => {
    const user = userEvent.setup();
    renderGate();

    await user.type(
      await screen.findByLabelText("パスワード"),
      "あさのかい",
    );
    await user.type(
      screen.getByLabelText("パスワード（もう一度）"),
      "あさのかい",
    );
    await user.click(screen.getByRole("button", { name: "決定" }));

    await user.click(
      await screen.findByLabelText("紙に控えました"),
    );
    await user.click(screen.getByRole("button", { name: "はじめる" }));

    expect(await screen.findByText("名簿の中身")).toBeInTheDocument();
  });
});

describe("パスワード設定済みのとき", () => {
  it("入力画面を出し、中身を見せない", async () => {
    await setTeacherPassword("あさのかい");
    renderGate();

    expect(await screen.findByLabelText("パスワード")).toBeInTheDocument();
    expect(screen.queryByText("名簿の中身")).not.toBeInTheDocument();
  });

  it("正しいパスワードを入れると中身が出る", async () => {
    const user = userEvent.setup();
    await setTeacherPassword("あさのかい");
    renderGate();

    await user.type(
      await screen.findByLabelText("パスワード"),
      "あさのかい",
    );
    await user.click(screen.getByRole("button", { name: "入る" }));

    expect(await screen.findByText("名簿の中身")).toBeInTheDocument();
  });

  it("違うパスワードでは中身が出ない", async () => {
    const user = userEvent.setup();
    await setTeacherPassword("あさのかい");
    renderGate();

    await user.type(await screen.findByLabelText("パスワード"), "ちがう");
    await user.click(screen.getByRole("button", { name: "入る" }));

    await screen.findByText("パスワードが違います");
    expect(screen.queryByText("名簿の中身")).not.toBeInTheDocument();
  });
});

describe("Provider を作り直したとき", () => {
  it("もう一度パスワードを求める", async () => {
    // リロード相当。認証状態がメモリだけにあることを守る。
    const user = userEvent.setup();
    await setTeacherPassword("あさのかい");

    const { unmount } = renderGate();
    await user.type(
      await screen.findByLabelText("パスワード"),
      "あさのかい",
    );
    await user.click(screen.getByRole("button", { name: "入る" }));
    await screen.findByText("名簿の中身");

    unmount();
    renderGate();

    expect(await screen.findByLabelText("パスワード")).toBeInTheDocument();
    expect(screen.queryByText("名簿の中身")).not.toBeInTheDocument();
  });
});

describe("crypto.subtle が使えないとき", () => {
  it("https で開くよう伝え、中身を見せない", async () => {
    // セキュアコンテキストでなければ crypto.subtle は存在せず、
    // パスワードの検証ができない。黙って壊れないようにする。
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues });

    renderGate();

    expect(
      await screen.findByText(/https で接続してください/),
    ).toBeInTheDocument();
    expect(screen.queryByText("名簿の中身")).not.toBeInTheDocument();
  });
});
