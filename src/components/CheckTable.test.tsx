import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DailyRoster } from "../db/dailyRoster";
import type { Student, SubmissionType } from "../db/schema";
import { addDays, toDateKey } from "../lib/date";
import { CheckTable } from "./CheckTable";

const drill: SubmissionType = {
  id: "t-drill",
  cohortId: "c1",
  name: "計算ドリル",
  deadline: "08:15",
  weekdays: [1, 2, 3, 4, 5],
  status: "active",
  order: 1,
  createdAt: 0,
};
const reading: SubmissionType = {
  ...drill,
  id: "t-reading",
  name: "音読カード",
  order: 2,
};

function student(number: number, name = ""): Student {
  return {
    id: `s${number}`,
    cohortId: "c1",
    attendanceNumber: number,
    name,
    status: "active",
    createdAt: 0,
  };
}

const roster: DailyRoster = {
  columns: [
    { type: drill, deadlinePassed: false, submittedCount: 1 },
    { type: reading, deadlinePassed: true, submittedCount: 2 },
  ],
  rows: [
    {
      student: student(1, "青木"),
      cells: { [drill.id]: "submitted", [reading.id]: "submitted" },
    },
    {
      student: student(2, "石田"),
      cells: { [drill.id]: "none", [reading.id]: "submitted" },
    },
    {
      student: student(3, "上田"),
      cells: { [drill.id]: "absent", [reading.id]: "none" },
    },
  ],
  activeCount: 3,
};

// 締切 08:15 に対して 08:00。「あと15分」になる。
const NOW = new Date(2026, 7, 24, 8, 0);
const TODAY_KEY = toDateKey(NOW);
const TOMORROW_KEY = addDays(TODAY_KEY, 1);

describe("CheckTable", () => {
  it("在籍生徒の行を全員ぶん出し、列見出しに人数を出す", () => {
    render(
      <CheckTable
        roster={roster}
        showNames={false}
        now={NOW}
        date={TODAY_KEY}
        onCellTap={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("row")).toHaveLength(4); // 見出し1 + 生徒3
    expect(screen.getByText("1/3")).toBeInTheDocument();
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("締切前は「あと◯分」、過ぎていれば「確定」を列見出しに出す", () => {
    render(
      <CheckTable
        roster={roster}
        showNames={false}
        now={NOW}
        date={TODAY_KEY}
        onCellTap={vi.fn()}
      />,
    );

    expect(screen.getByText("あと15分")).toBeInTheDocument();
    expect(screen.getByText("確定")).toBeInTheDocument();
  });

  it("未来日の列は「締切 08:15」と出て「あと」を含まない", () => {
    render(
      <CheckTable
        roster={roster}
        showNames={false}
        now={NOW}
        date={TOMORROW_KEY}
        onCellTap={vi.fn()}
      />,
    );

    expect(screen.getByText("締切 08:15")).toBeInTheDocument();
    expect(screen.queryByText(/^あと\d+分$/)).toBeNull();
  });

  it("提出済みのセルはボタンではなく、押せない", () => {
    render(
      <CheckTable
        roster={roster}
        showNames={false}
        now={NOW}
        date={TODAY_KEY}
        onCellTap={vi.fn()}
      />,
    );

    const cell = screen.getByRole("img", { name: "1番 計算ドリル 提出済み" });
    expect(cell.tagName).not.toBe("BUTTON");
  });

  it("未提出のセルを押すと onCellTap に none で渡す", async () => {
    const user = userEvent.setup();
    const onCellTap = vi.fn();
    render(
      <CheckTable
        roster={roster}
        showNames={false}
        now={NOW}
        date={TODAY_KEY}
        onCellTap={onCellTap}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "2番 計算ドリル 未提出" }),
    );

    expect(onCellTap).toHaveBeenCalledWith(roster.rows[1].student, drill, "none");
  });

  it("欠席のセルを押すと onCellTap に absent で渡す", async () => {
    const user = userEvent.setup();
    const onCellTap = vi.fn();
    render(
      <CheckTable
        roster={roster}
        showNames={false}
        now={NOW}
        date={TODAY_KEY}
        onCellTap={onCellTap}
      />,
    );

    await user.click(screen.getByRole("button", { name: "3番 計算ドリル 欠席" }));

    expect(onCellTap).toHaveBeenCalledWith(
      roster.rows[2].student,
      drill,
      "absent",
    );
  });

  it("欠席セルの「欠」の文字は墨色で読める", () => {
    render(
      <CheckTable
        roster={roster}
        showNames={false}
        now={NOW}
        date={TODAY_KEY}
        onCellTap={vi.fn()}
      />,
    );

    const cell = screen.getByRole("button", { name: "3番 計算ドリル 欠席" });
    expect(cell).toHaveClass("text-sumi");
  });

  it("showNames が true のときだけ氏名を出す", () => {
    const { rerender } = render(
      <CheckTable
        roster={roster}
        showNames={false}
        now={NOW}
        date={TODAY_KEY}
        onCellTap={vi.fn()}
      />,
    );
    expect(screen.queryByText("青木")).toBeNull();

    rerender(
      <CheckTable
        roster={roster}
        showNames={true}
        now={NOW}
        date={TODAY_KEY}
        onCellTap={vi.fn()}
      />,
    );
    expect(screen.getByText("青木")).toBeInTheDocument();
  });

  it("行見出しの出席番号は24pt以上の数字書体で出す", () => {
    render(
      <CheckTable
        roster={roster}
        showNames={false}
        now={NOW}
        date={TODAY_KEY}
        onCellTap={vi.fn()}
      />,
    );

    const rowHeader = screen.getAllByRole("rowheader")[0];
    const number = within(rowHeader).getByText("1");
    expect(number).toHaveClass("font-num", "text-[2rem]");
  });

  it("表に名前が付いている", () => {
    render(
      <CheckTable
        roster={roster}
        showNames={false}
        now={NOW}
        date={TODAY_KEY}
        onCellTap={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("table", { name: "その日の提出状況" }),
    ).toBeInTheDocument();
  });
});
