import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Student } from "../db/schema";
import { ScanResult } from "./ScanResult";

const student: Student = {
  id: "s1",
  cohortId: "c1",
  attendanceNumber: 12,
  name: "",
  status: "active",
  createdAt: 0,
};

describe("ScanResult", () => {
  it("対象日が添えられているとき、日本語として読める文で表示する", () => {
    render(
      <ScanResult
        result={{ kind: "recorded", student }}
        dateLabel="8月24日(月)"
      />,
    );

    // 「8月24日(月)分」のように名詞に接続しない「分」を単独で出さない。
    expect(screen.getByText("8月24日(月)の記録")).toBeInTheDocument();
  });

  it("今日を見ているとき(dateLabelなし)は対象日を添えない", () => {
    render(<ScanResult result={{ kind: "recorded", student }} />);

    expect(screen.queryByText(/の記録/)).not.toBeInTheDocument();
  });

  it("提出済みのときだけ、onWithdrawがあれば「取り消す」を出す", async () => {
    const user = userEvent.setup();
    const onWithdraw = vi.fn();
    render(
      <ScanResult
        result={{ kind: "already", student }}
        onWithdraw={onWithdraw}
      />,
    );

    await user.click(screen.getByRole("button", { name: "取り消す" }));

    expect(onWithdraw).toHaveBeenCalled();
  });

  it("提出直後(recorded)には「取り消す」を出さない", () => {
    render(
      <ScanResult result={{ kind: "recorded", student }} onWithdraw={vi.fn()} />,
    );

    expect(
      screen.queryByRole("button", { name: "取り消す" }),
    ).not.toBeInTheDocument();
  });

  it("onWithdrawが無ければ提出済みでも「取り消す」を出さない", () => {
    render(<ScanResult result={{ kind: "already", student }} />);

    expect(
      screen.queryByRole("button", { name: "取り消す" }),
    ).not.toBeInTheDocument();
  });

  it("取り消し後は「取り消しました」と出し、花丸は描かない", () => {
    render(<ScanResult result={{ kind: "withdrawn", student }} />);

    expect(screen.getByText("取り消しました")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "提出しました" })).toBeNull();
  });
});
