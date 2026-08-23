import { describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { getSetting, setSetting } from "./settings";

useFreshDb();

describe("getSetting", () => {
  it("未設定なら showStudentNames は false", async () => {
    expect(await getSetting("showStudentNames")).toBe(false);
  });

  it("未設定なら rosterHintDismissed は false", async () => {
    expect(await getSetting("rosterHintDismissed")).toBe(false);
  });
});

describe("setSetting", () => {
  it("保存した値を読み戻せる", async () => {
    await setSetting("showStudentNames", true);
    expect(await getSetting("showStudentNames")).toBe(true);
  });

  it("false に戻せる", async () => {
    await setSetting("showStudentNames", true);
    await setSetting("showStudentNames", false);
    expect(await getSetting("showStudentNames")).toBe(false);
  });

  it("キーごとに独立している", async () => {
    await setSetting("showStudentNames", true);
    expect(await getSetting("rosterHintDismissed")).toBe(false);
  });
});
