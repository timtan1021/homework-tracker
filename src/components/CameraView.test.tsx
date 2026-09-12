import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CameraView } from "./CameraView";

const refs = { videoRef: { current: null }, canvasRef: { current: null } };

describe("CameraView", () => {
  it("idleのときは起動ボタンを出し、映像は出さない", () => {
    render(
      <CameraView
        state="idle"
        message={null}
        onStart={vi.fn()}
        {...refs}
      />,
    );

    expect(
      screen.getByRole("button", { name: "カメラを起動" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("起動ボタンを押すとonStartが呼ばれる", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<CameraView state="idle" message={null} onStart={onStart} {...refs} />);

    await user.click(screen.getByRole("button", { name: "カメラを起動" }));

    expect(onStart).toHaveBeenCalled();
  });

  it("unavailable/deniedのときは起動ボタンを出さず理由だけ出す", () => {
    render(
      <CameraView
        state="denied"
        message="カメラを使えません。端末の設定で許可するか、番号でチェックしてください"
        onStart={vi.fn()}
        {...refs}
      />,
    );

    expect(
      screen.getByText(
        "カメラを使えません。端末の設定で許可するか、番号でチェックしてください",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "カメラを起動" }),
    ).not.toBeInTheDocument();
  });
});
