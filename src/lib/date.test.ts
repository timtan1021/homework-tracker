import { describe, expect, it } from "vitest";
import {
  formatDateHeading,
  isPastDeadline,
  recentDateKeys,
  toDateKey,
  weekdayOfDateKey,
} from "./date";

describe("toDateKey", () => {
  it("YYYY-MM-DD 形式にする", () => {
    expect(toDateKey(new Date(2026, 7, 24))).toBe("2026-08-24");
  });

  it("月日を0埋めする", () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("深夜でも同じ日になる", () => {
    // UTC変換を挟むと前日にずれる時刻。ローカルで切ることを確かめる。
    expect(toDateKey(new Date(2026, 7, 24, 0, 30))).toBe("2026-08-24");
  });

  it("夜遅くでも同じ日になる", () => {
    expect(toDateKey(new Date(2026, 7, 24, 23, 45))).toBe("2026-08-24");
  });
});

describe("formatDateHeading", () => {
  it("月日と曜日を出す", () => {
    // 2026-08-24 は月曜
    expect(formatDateHeading(new Date(2026, 7, 24))).toBe("8月24日(月)");
  });

  it("日曜を正しく出す", () => {
    // 2026-08-23 は日曜
    expect(formatDateHeading(new Date(2026, 7, 23))).toBe("8月23日(日)");
  });

  it("月日を0埋めしない", () => {
    expect(formatDateHeading(new Date(2026, 0, 5))).toBe("1月5日(月)");
  });
});

describe("isPastDeadline", () => {
  it("過去の日付は締切時刻に関わらず過ぎている", () => {
    expect(
      isPastDeadline("2026-08-20", "23:59", new Date(2026, 7, 24, 0, 0)),
    ).toBe(true);
  });

  it("未来の日付は締切時刻に関わらず過ぎていない", () => {
    expect(
      isPastDeadline("2026-08-30", "00:00", new Date(2026, 7, 24, 23, 59)),
    ).toBe(false);
  });

  it("今日で締切時刻ちょうどなら過ぎている", () => {
    expect(
      isPastDeadline("2026-08-24", "08:15", new Date(2026, 7, 24, 8, 15)),
    ).toBe(true);
  });

  it("今日で締切1分前なら過ぎていない", () => {
    expect(
      isPastDeadline("2026-08-24", "08:15", new Date(2026, 7, 24, 8, 14)),
    ).toBe(false);
  });

  it("今日で締切1分後なら過ぎている", () => {
    expect(
      isPastDeadline("2026-08-24", "08:15", new Date(2026, 7, 24, 8, 16)),
    ).toBe(true);
  });
});

describe("weekdayOfDateKey", () => {
  it("月曜を1で返す", () => {
    // 2026-08-24 は月曜
    expect(weekdayOfDateKey("2026-08-24")).toBe(1);
  });

  it("日曜を0で返す", () => {
    expect(weekdayOfDateKey("2026-08-23")).toBe(0);
  });
});

describe("recentDateKeys", () => {
  it("endDateを含むdays日ぶんを古い順に返す", () => {
    expect(recentDateKeys("2026-08-25", 3)).toEqual([
      "2026-08-23",
      "2026-08-24",
      "2026-08-25",
    ]);
  });

  it("月をまたぐ", () => {
    expect(recentDateKeys("2026-09-01", 3)).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
    ]);
  });

  it("days=1ならendDateだけ返す", () => {
    expect(recentDateKeys("2026-08-25", 1)).toEqual(["2026-08-25"]);
  });
});
