import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
  it("提出物名と「提出/在籍」を出す", () => {
    render(<ProgressBar label="計算ドリル" value={28} max={34} />);

    expect(screen.getByText("計算ドリル")).toBeInTheDocument();
    expect(screen.getByText("28/34")).toBeInTheDocument();
  });

  it("progressbar として値を伝える", () => {
    render(<ProgressBar label="計算ドリル" value={28} max={34} />);

    const bar = screen.getByRole("progressbar", { name: "計算ドリル" });
    expect(bar).toHaveAttribute("aria-valuenow", "28");
    expect(bar).toHaveAttribute("aria-valuemax", "34");
  });

  it("全員提出したら数字の代わりに「全員」と出す", () => {
    render(<ProgressBar label="計算ドリル" value={34} max={34} />);

    expect(screen.getByText("全員")).toBeInTheDocument();
    expect(screen.queryByText("34/34")).toBeNull();
  });

  it("在籍0人なら「0/0」で、幅は0%", () => {
    render(<ProgressBar label="計算ドリル" value={0} max={0} />);

    expect(screen.getByText("0/0")).toBeInTheDocument();
    expect(screen.getByTestId("progress-fill")).toHaveStyle({ width: "0%" });
  });

  it("塗りの幅は割合に比例する", () => {
    render(<ProgressBar label="計算ドリル" value={17} max={34} />);

    expect(screen.getByTestId("progress-fill")).toHaveStyle({ width: "50%" });
  });
});
