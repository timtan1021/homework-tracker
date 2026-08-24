import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { createCohort } from "./cohorts";
import { ValidationError } from "./errors";
import {
  addSubmissionType,
  deleteSubmissionType,
  endSubmissionType,
  getSubmissionType,
  listSubmissionTypes,
  moveSubmissionType,
  normalizeName,
  restoreSubmissionType,
  updateSubmissionType,
} from "./submissionTypes";

useFreshDb();

let cohortId = "";

const WEEKDAYS = [1, 2, 3, 4, 5];

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function drill(overrides: Partial<Parameters<typeof addSubmissionType>[0]> = {}) {
  return addSubmissionType({
    cohortId,
    name: "計算ドリル",
    deadline: "08:15",
    weekdays: WEEKDAYS,
    ...overrides,
  });
}

describe("normalizeName", () => {
  it("前後の空白を落とす", () => {
    expect(normalizeName("  計算ドリル  ")).toBe("計算ドリル");
  });

  it("半角カタカナを全角に揃える", () => {
    expect(normalizeName("ﾄﾞﾘﾙ")).toBe(normalizeName("ドリル"));
  });

  it("英字の大小を揃える", () => {
    expect(normalizeName("Drill")).toBe(normalizeName("drill"));
  });
});

describe("addSubmissionType", () => {
  it("有効な提出物として登録する", async () => {
    const type = await drill();

    expect(type.status).toBe("active");
    expect(type.name).toBe("計算ドリル");
    expect(type.deadline).toBe("08:15");
    expect(type.weekdays).toEqual([1, 2, 3, 4, 5]);
  });

  it("入力したままの名前を保存する", async () => {
    const type = await drill({ name: "  Drill ノート  " });

    // 比較のときだけ正規化する。表示は先生が打った通りにする。
    expect(type.name).toBe("Drill ノート");
  });

  it("曜日を昇順に整列し重複を除く", async () => {
    const type = await drill({ weekdays: [5, 1, 3, 1] });

    expect(type.weekdays).toEqual([1, 3, 5]);
  });

  it("order を1から順に振る", async () => {
    const first = await drill({ name: "計算ドリル" });
    const second = await drill({ name: "音読カード" });

    expect(first.order).toBe(1);
    expect(second.order).toBe(2);
  });

  it("名前が空なら拒否する", async () => {
    await expect(drill({ name: "   " })).rejects.toThrow(
      new ValidationError("提出物の名前を入力してください"),
    );
  });

  it("曜日が空なら拒否する", async () => {
    await expect(drill({ weekdays: [] })).rejects.toThrow(
      new ValidationError("提出する曜日を1つ以上選んでください"),
    );
  });

  it("曜日に0〜6以外が混ざれば拒否する", async () => {
    await expect(drill({ weekdays: [1, 7] })).rejects.toThrow(
      new ValidationError("提出する曜日を1つ以上選んでください"),
    );
  });

  it("締切時刻が空なら拒否する", async () => {
    await expect(drill({ deadline: "" })).rejects.toThrow(
      new ValidationError("締切時刻を入力してください"),
    );
  });

  it("締切時刻の形式が違えば拒否する", async () => {
    await expect(drill({ deadline: "8時15分" })).rejects.toThrow(
      new ValidationError("締切時刻を入力してください"),
    );
  });

  it("ありえない時刻を拒否する", async () => {
    await expect(drill({ deadline: "25:00" })).rejects.toThrow(
      new ValidationError("締切時刻を入力してください"),
    );
  });

  it("有効な提出物と名前が重なれば拒否する", async () => {
    await drill();

    await expect(drill()).rejects.toThrow(
      new ValidationError("計算ドリルはすでに登録されています"),
    );
  });

  it("表記ゆれでも重複と見なす", async () => {
    await drill({ name: "ドリル" });

    await expect(drill({ name: " ﾄﾞﾘﾙ " })).rejects.toThrow(ValidationError);
  });

  it("終了した提出物と名前が重なれば理由を示して拒否する", async () => {
    const type = await drill();
    await endSubmissionType(type.id);

    await expect(drill()).rejects.toThrow(
      new ValidationError("計算ドリルは終了した提出物として登録されています"),
    );
  });

  it("別のcohortとは名前が重なってもよい", async () => {
    const other = await createCohort({ year: 2025, className: "4年1組" });
    await addSubmissionType({
      cohortId: other.id,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: WEEKDAYS,
    });

    const type = await drill();
    expect(type.name).toBe("計算ドリル");
  });
});

describe("listSubmissionTypes", () => {
  it("order の昇順で返す", async () => {
    await drill({ name: "計算ドリル" });
    await drill({ name: "音読カード" });
    await drill({ name: "日記" });

    const names = (await listSubmissionTypes(cohortId)).map((t) => t.name);
    expect(names).toEqual(["計算ドリル", "音読カード", "日記"]);
  });

  it("終了したものも含めて返す", async () => {
    const type = await drill();
    await endSubmissionType(type.id);

    expect(await listSubmissionTypes(cohortId)).toHaveLength(1);
  });

  it("他のcohortのものを含めない", async () => {
    const other = await createCohort({ year: 2025, className: "4年1組" });
    await addSubmissionType({
      cohortId: other.id,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: WEEKDAYS,
    });

    expect(await listSubmissionTypes(cohortId)).toHaveLength(0);
  });
});

describe("updateSubmissionType", () => {
  it("名前・締切・曜日を変更できる", async () => {
    const type = await drill();

    const updated = await updateSubmissionType(type.id, {
      name: "計算プリント",
      deadline: "08:30",
      weekdays: [1, 3, 5],
    });

    expect(updated.name).toBe("計算プリント");
    expect(updated.deadline).toBe("08:30");
    expect(updated.weekdays).toEqual([1, 3, 5]);
  });

  it("自分自身の名前のままなら通す", async () => {
    const type = await drill();

    const updated = await updateSubmissionType(type.id, {
      name: "計算ドリル",
      deadline: "08:30",
      weekdays: WEEKDAYS,
    });

    expect(updated.deadline).toBe("08:30");
  });

  it("終了した提出物と名前が重なれば理由を示して拒否する", async () => {
    const ended = await drill({ name: "日記" });
    await endSubmissionType(ended.id);
    const active = await drill({ name: "計算ドリル" });

    await expect(
      updateSubmissionType(active.id, {
        name: "日記",
        deadline: "08:15",
        weekdays: WEEKDAYS,
      }),
    ).rejects.toThrow(
      new ValidationError("日記は終了した提出物として登録されています"),
    );
  });

  it("終了した自分自身の名前のままなら通す", async () => {
    // 終了したものを編集する経路。自己衝突と判定してはいけない。
    const type = await drill();
    await endSubmissionType(type.id);

    const updated = await updateSubmissionType(type.id, {
      name: "計算ドリル",
      deadline: "08:30",
      weekdays: WEEKDAYS,
    });

    expect(updated.deadline).toBe("08:30");
  });

  it("他の提出物と名前が重なれば拒否する", async () => {
    await drill({ name: "計算ドリル" });
    const second = await drill({ name: "音読カード" });

    await expect(
      updateSubmissionType(second.id, {
        name: "計算ドリル",
        deadline: "08:15",
        weekdays: WEEKDAYS,
      }),
    ).rejects.toThrow(new ValidationError("計算ドリルはすでに登録されています"));
  });

  it("order と status は変えない", async () => {
    const type = await drill();
    await endSubmissionType(type.id);

    const updated = await updateSubmissionType(type.id, {
      name: "計算プリント",
      deadline: "08:15",
      weekdays: WEEKDAYS,
    });

    expect(updated.order).toBe(type.order);
    expect(updated.status).toBe("ended");
  });

  it("存在しないIDなら拒否する", async () => {
    await expect(
      updateSubmissionType("missing", {
        name: "計算ドリル",
        deadline: "08:15",
        weekdays: WEEKDAYS,
      }),
    ).rejects.toThrow(new ValidationError("この提出物は見つかりません"));
  });
});

describe("endSubmissionType と restoreSubmissionType", () => {
  it("終了にできる", async () => {
    const type = await drill();

    expect((await endSubmissionType(type.id)).status).toBe("ended");
  });

  it("有効に戻せる", async () => {
    const type = await drill();
    await endSubmissionType(type.id);

    expect((await restoreSubmissionType(type.id)).status).toBe("active");
  });

  it("存在しないIDなら拒否する", async () => {
    await expect(endSubmissionType("missing")).rejects.toThrow(
      new ValidationError("この提出物は見つかりません"),
    );
  });
});

describe("deleteSubmissionType", () => {
  it("削除すると一覧から消える", async () => {
    const type = await drill();
    await deleteSubmissionType(type.id);

    expect(await getSubmissionType(type.id)).toBeNull();
    expect(await listSubmissionTypes(cohortId)).toHaveLength(0);
  });

  it("削除した名前は再利用できる", async () => {
    const type = await drill();
    await deleteSubmissionType(type.id);

    const reused = await drill();
    expect(reused.name).toBe("計算ドリル");
    expect(reused.id).not.toBe(type.id);
  });
});

describe("moveSubmissionType", () => {
  async function names(): Promise<string[]> {
    return (await listSubmissionTypes(cohortId)).map((t) => t.name);
  }

  beforeEach(async () => {
    await drill({ name: "計算ドリル" });
    await drill({ name: "音読カード" });
    await drill({ name: "日記" });
  });

  it("上へ動かすと1つ前と入れ替わる", async () => {
    const list = await listSubmissionTypes(cohortId);
    await moveSubmissionType(list[1].id, "up");

    expect(await names()).toEqual(["音読カード", "計算ドリル", "日記"]);
  });

  it("下へ動かすと1つ後と入れ替わる", async () => {
    const list = await listSubmissionTypes(cohortId);
    await moveSubmissionType(list[1].id, "down");

    expect(await names()).toEqual(["計算ドリル", "日記", "音読カード"]);
  });

  it("先頭を上へ動かしても変わらない", async () => {
    const list = await listSubmissionTypes(cohortId);
    await moveSubmissionType(list[0].id, "up");

    expect(await names()).toEqual(["計算ドリル", "音読カード", "日記"]);
  });

  it("末尾を下へ動かしても変わらない", async () => {
    const list = await listSubmissionTypes(cohortId);
    await moveSubmissionType(list[2].id, "down");

    expect(await names()).toEqual(["計算ドリル", "音読カード", "日記"]);
  });

  it("終了したものを飛ばして入れ替える", async () => {
    const list = await listSubmissionTypes(cohortId);
    await endSubmissionType(list[1].id); // 音読カードを終了に

    // 日記から見た「上」は、終了した音読カードではなく計算ドリル
    await moveSubmissionType(list[2].id, "up");

    const active = (await listSubmissionTypes(cohortId))
      .filter((t) => t.status === "active")
      .map((t) => t.name);
    expect(active).toEqual(["日記", "計算ドリル"]);
  });
});
