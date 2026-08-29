import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TeacherAuthProvider, useTeacherAuth } from "./TeacherAuthProvider";

function Probe() {
  const { authenticated, signIn, signOut } = useTeacherAuth();
  return (
    <div>
      <p>{authenticated ? "認証済み" : "未認証"}</p>
      <button type="button" onClick={signIn}>
        入る
      </button>
      <button type="button" onClick={signOut}>
        出る
      </button>
    </div>
  );
}

describe("TeacherAuthProvider", () => {
  it("最初は未認証", () => {
    render(
      <TeacherAuthProvider>
        <Probe />
      </TeacherAuthProvider>,
    );

    expect(screen.getByText("未認証")).toBeInTheDocument();
  });

  it("signIn で認証済みになる", async () => {
    const user = userEvent.setup();
    render(
      <TeacherAuthProvider>
        <Probe />
      </TeacherAuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: "入る" }));

    expect(screen.getByText("認証済み")).toBeInTheDocument();
  });

  it("signOut で未認証に戻る", async () => {
    const user = userEvent.setup();
    render(
      <TeacherAuthProvider>
        <Probe />
      </TeacherAuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: "入る" }));
    await user.click(screen.getByRole("button", { name: "出る" }));

    expect(screen.getByText("未認証")).toBeInTheDocument();
  });

  it("作り直すと未認証に戻る", async () => {
    // リロード相当。認証状態をメモリだけに置いていることを守る。
    // sessionStorage に書くと、この期待が壊れる。
    const user = userEvent.setup();
    const { unmount } = render(
      <TeacherAuthProvider>
        <Probe />
      </TeacherAuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: "入る" }));
    unmount();

    render(
      <TeacherAuthProvider>
        <Probe />
      </TeacherAuthProvider>,
    );

    expect(screen.getByText("未認証")).toBeInTheDocument();
  });

  it("Provider の外で使うと例外を投げる", () => {
    // フェイルクローズ。Provider を付け忘れたルートが
    // 認証なしで通ってしまう事故を防ぐ。
    expect(() => render(<Probe />)).toThrow();
  });
});
