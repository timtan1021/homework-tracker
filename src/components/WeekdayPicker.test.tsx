import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WeekdayPicker } from "./WeekdayPicker";

describe("WeekdayPicker", () => {
  it("曜日の7つのボタンを出す", () => {
    render(<WeekdayPicker value={[]} onChange={vi.fn()} />);

    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(7);
  });

  it("選択状態を aria-pressed で伝える", () => {
    render(<WeekdayPicker value={[1, 3]} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "月" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "火" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "水" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("選ばれていない曜日を押すと足して返す", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WeekdayPicker value={[1]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "水" }));

    expect(onChange).toHaveBeenCalledWith([1, 3]);
  });

  it("選ばれている曜日を押すと外して返す", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WeekdayPicker value={[1, 3]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "月" }));

    expect(onChange).toHaveBeenCalledWith([3]);
  });

  it("昇順に整列して返す", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WeekdayPicker value={[5, 1]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "水" }));

    expect(onChange).toHaveBeenCalledWith([1, 3, 5]);
  });

  it("「平日」を押すと月〜金を選ぶ", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WeekdayPicker value={[0, 6]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "平日" }));

    expect(onChange).toHaveBeenCalledWith([1, 2, 3, 4, 5]);
  });

  it("「毎日」を押すと全曜日を選ぶ", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WeekdayPicker value={[1]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "毎日" }));

    expect(onChange).toHaveBeenCalledWith([0, 1, 2, 3, 4, 5, 6]);
  });

  it("最後の1つを外すこともできる", async () => {
    // 空を弾くのは保存時。ここで押させないと直せなくなる。
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WeekdayPicker value={[1]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "月" }));

    expect(onChange).toHaveBeenCalledWith([]);
  });
});
