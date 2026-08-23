import { describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { ValidationError } from "./errors";
import { createCohort, getActiveCohort } from "./cohorts";

useFreshDb();

describe("createCohort", () => {
  it("作成したcohortを有効なcohortとして返す", async () => {
    const created = await createCohort({ year: 2026, className: "5年1組" });
    const active = await getActiveCohort();

    expect(active).not.toBeNull();
    expect(active?.id).toBe(created.id);
    expect(active?.year).toBe(2026);
    expect(active?.className).toBe("5年1組");
    expect(active?.isActive).toBe(true);
  });

  it("新しいcohortを作ると前のcohortは有効でなくなる", async () => {
    await createCohort({ year: 2025, className: "4年1組" });
    const second = await createCohort({ year: 2026, className: "5年1組" });

    const active = await getActiveCohort();
    expect(active?.id).toBe(second.id);
  });

  it("クラス名の前後の空白を取り除く", async () => {
    const created = await createCohort({ year: 2026, className: "  5年1組  " });
    expect(created.className).toBe("5年1組");
  });

  it("クラス名が空なら拒否する", async () => {
    await expect(createCohort({ year: 2026, className: "   " })).rejects.toThrow(
      new ValidationError("クラス名を入力してください"),
    );
  });
});

describe("getActiveCohort", () => {
  it("cohortが1つも無ければ null を返す", async () => {
    expect(await getActiveCohort()).toBeNull();
  });
});
