import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DateStepper } from "./DateStepper";

const labels = { prev: "← 前日", next: "翌日 →", backToToday: "今日へ" };

describe("DateStepper", () => {
  it("前後のボタンを出す", () => {
    render(
      <DateStepper
        date="2026-08-24"
        today="2026-08-24"
        onChange={() => {}}
        labels={labels}
      />,
    );

    expect(screen.getByRole("button", { name: "← 前日" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "翌日 →" })).toBeInTheDocument();
  });

  it("前日を押すと1日前をonChangeで渡す", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DateStepper
        date="2026-08-24"
        today="2026-08-20"
        onChange={onChange}
        labels={labels}
      />,
    );

    await user.click(screen.getByRole("button", { name: "← 前日" }));

    expect(onChange).toHaveBeenCalledWith("2026-08-23");
  });

  it("翌日を押すと1日後をonChangeで渡す", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DateStepper
        date="2026-08-24"
        today="2026-08-20"
        onChange={onChange}
        labels={labels}
      />,
    );

    await user.click(screen.getByRole("button", { name: "翌日 →" }));

    expect(onChange).toHaveBeenCalledWith("2026-08-25");
  });

  it("今日にいるときは「今日へ」を出さない", () => {
    render(
      <DateStepper
        date="2026-08-24"
        today="2026-08-24"
        onChange={() => {}}
        labels={labels}
      />,
    );

    expect(screen.queryByRole("button", { name: "今日へ" })).toBeNull();
  });

  it("今日以外にいるときは「今日へ」を出す。押すと今日に戻る", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DateStepper
        date="2026-08-27"
        today="2026-08-24"
        onChange={onChange}
        labels={labels}
      />,
    );

    await user.click(screen.getByRole("button", { name: "今日へ" }));

    expect(onChange).toHaveBeenCalledWith("2026-08-24");
  });

  it("minを下回る前日ボタンは出さない", () => {
    render(
      <DateStepper
        date="2026-08-24"
        today="2026-08-24"
        onChange={() => {}}
        labels={labels}
        min="2026-08-24"
      />,
    );

    expect(screen.queryByRole("button", { name: "← 前日" })).toBeNull();
  });

  it("maxを上回る翌日ボタンは出さない", () => {
    render(
      <DateStepper
        date="2026-08-25"
        today="2026-08-24"
        onChange={() => {}}
        labels={labels}
        max="2026-08-25"
      />,
    );

    expect(screen.queryByRole("button", { name: "翌日 →" })).toBeNull();
  });

  it("前日がちょうど今日なら、前日ボタンではなく今日へボタンだけになる", () => {
    render(
      <DateStepper
        date="2026-08-25"
        today="2026-08-24"
        onChange={() => {}}
        labels={labels}
      />,
    );

    expect(screen.queryByRole("button", { name: "← 前日" })).toBeNull();
    expect(screen.getByRole("button", { name: "今日へ" })).toBeInTheDocument();
  });

  it("翌日がちょうど今日なら、翌日ボタンではなく今日へボタンだけになる", () => {
    render(
      <DateStepper
        date="2026-08-23"
        today="2026-08-24"
        onChange={() => {}}
        labels={labels}
      />,
    );

    expect(screen.queryByRole("button", { name: "翌日 →" })).toBeNull();
    expect(screen.getByRole("button", { name: "今日へ" })).toBeInTheDocument();
  });
});
