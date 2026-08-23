import { describe, expect, it } from "vitest";
import { currentSchoolYear } from "./schoolYear";

describe("currentSchoolYear", () => {
  it("4月以降はその年をそのまま年度として返す", () => {
    expect(currentSchoolYear(new Date(2026, 7, 23))).toBe(2026);
  });

  it("4月1日は新年度の初日として扱う", () => {
    expect(currentSchoolYear(new Date(2026, 3, 1))).toBe(2026);
  });

  it("3月31日はまだ前年度として扱う", () => {
    expect(currentSchoolYear(new Date(2026, 2, 31))).toBe(2025);
  });

  it("1月は前年度として扱う", () => {
    expect(currentSchoolYear(new Date(2026, 0, 15))).toBe(2025);
  });
});
