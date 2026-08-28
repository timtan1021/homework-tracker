import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { createCohort } from "./cohorts";
import {
  addDateSubmission,
  deleteDateSubmission,
  listDateSubmissionsInWeek,
  updateDateSubmissionName,
} from "./dateSubmissions";

useFreshDb();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

describe("addDateSubmission", () => {
  it("日付指定の提出物を登録する", async () => {
    const type = await addDateSubmission({
      cohortId,
      name: "計算プリントp23",
      date: "2026-09-01",
      deadline: "08:15",
    });

    expect(type.name).toBe("計算プリントp23");
    expect(type.date).toBe("2026-09-01");
    expect(type.weekdays).toEqual([]);
    expect(type.status).toBe("active");
  });

  it("名前が空なら拒否する", async () => {
    await expect(
      addDateSubmission({
        cohortId,
        name: "  ",
        date: "2026-09-01",
        deadline: "08:15",
      }),
    ).rejects.toThrow("宿題の名前を入力してください");
  });

  it("日付の形式が不正なら拒否する", async () => {
    await expect(
      addDateSubmission({
        cohortId,
        name: "テスト",
        date: "2026/09/01",
        deadline: "08:15",
      }),
    ).rejects.toThrow("日付を選んでください");
  });

  it("締切時刻の形式が不正なら拒否する", async () => {
    await expect(
      addDateSubmission({
        cohortId,
        name: "テスト",
        date: "2026-09-01",
        deadline: "8:15",
      }),
    ).rejects.toThrow("締切時刻を入力してください");
  });

  it("同じ名前を複数の日付に登録できる", async () => {
    await addDateSubmission({
      cohortId,
      name: "計算プリント",
      date: "2026-09-01",
      deadline: "08:15",
    });
    const second = await addDateSubmission({
      cohortId,
      name: "計算プリント",
      date: "2026-09-02",
      deadline: "08:15",
    });

    expect(second.name).toBe("計算プリント");
  });
});

describe("updateDateSubmissionName", () => {
  it("名前を更新する", async () => {
    const type = await addDateSubmission({
      cohortId,
      name: "元の名前",
      date: "2026-09-01",
      deadline: "08:15",
    });

    await updateDateSubmissionName(type.id, "新しい名前");

    const list = await listDateSubmissionsInWeek(cohortId, ["2026-09-01"]);
    expect(list[0].name).toBe("新しい名前");
  });

  it("空文字にすると拒否する", async () => {
    const type = await addDateSubmission({
      cohortId,
      name: "元の名前",
      date: "2026-09-01",
      deadline: "08:15",
    });

    await expect(updateDateSubmissionName(type.id, "  ")).rejects.toThrow(
      "宿題の名前を入力してください",
    );
  });

  it("存在しないIDなら拒否する", async () => {
    await expect(
      updateDateSubmissionName("missing", "新しい名前"),
    ).rejects.toThrow("この宿題は見つかりません");
  });
});

describe("deleteDateSubmission", () => {
  it("完全に削除する", async () => {
    const type = await addDateSubmission({
      cohortId,
      name: "テスト",
      date: "2026-09-01",
      deadline: "08:15",
    });

    await deleteDateSubmission(type.id);

    expect(await listDateSubmissionsInWeek(cohortId, ["2026-09-01"])).toEqual(
      [],
    );
  });
});

describe("listDateSubmissionsInWeek", () => {
  it("対象週の日付だけを日付順で返す", async () => {
    await addDateSubmission({
      cohortId,
      name: "9/2の宿題",
      date: "2026-09-02",
      deadline: "08:15",
    });
    await addDateSubmission({
      cohortId,
      name: "9/1の宿題",
      date: "2026-09-01",
      deadline: "08:15",
    });
    await addDateSubmission({
      cohortId,
      name: "対象外",
      date: "2026-09-08",
      deadline: "08:15",
    });

    const list = await listDateSubmissionsInWeek(cohortId, [
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
      "2026-09-07",
    ]);

    expect(list.map((t) => t.name)).toEqual(["9/1の宿題", "9/2の宿題"]);
  });

  it("別のクラスの項目は含まない", async () => {
    const other = await createCohort({ year: 2025, className: "4年1組" });
    await addDateSubmission({
      cohortId: other.id,
      name: "他クラスの宿題",
      date: "2026-09-01",
      deadline: "08:15",
    });

    const list = await listDateSubmissionsInWeek(cohortId, ["2026-09-01"]);
    expect(list).toEqual([]);
  });
});
