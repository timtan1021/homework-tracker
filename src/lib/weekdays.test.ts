import { describe, expect, it } from "vitest";
import { formatWeekdays, WEEKDAY_LABELS } from "./weekdays";

describe("WEEKDAY_LABELS", () => {
  it("日曜から土曜まで7つある", () => {
    expect(WEEKDAY_LABELS).toEqual(["日", "月", "火", "水", "木", "金", "土"]);
  });
});

describe("formatWeekdays", () => {
  it("平日を連結して返す", () => {
    expect(formatWeekdays([1, 2, 3, 4, 5])).toBe("月火水木金");
  });

  it("すべて選ばれていれば毎日と返す", () => {
    expect(formatWeekdays([0, 1, 2, 3, 4, 5, 6])).toBe("毎日");
  });

  it("1つだけでも返せる", () => {
    expect(formatWeekdays([1])).toBe("月");
  });

  it("順番が入れ替わっていても曜日順に並べて返す", () => {
    expect(formatWeekdays([5, 1, 3])).toBe("月水金");
  });

  it("空なら未設定と返す", () => {
    // データ層が空を拒否するため通常は起きないが、
    // 画面が落ちないよう文字列を返す。
    expect(formatWeekdays([])).toBe("未設定");
  });
});
