import { describe, expect, it } from "vitest";
import { formatDateHeading, toDateKey } from "./date";

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
