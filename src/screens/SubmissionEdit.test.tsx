import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { renderAsTeacher } from "../test/router";
import { createCohort } from "../db/cohorts";
import {
  addSubmissionType,
  endSubmissionType,
  getSubmissionType,
  listSubmissionTypes,
} from "../db/submissionTypes";

useFreshDb();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function add(name = "計算ドリル", weekdays = [1, 2, 3, 4, 5]) {
  return addSubmissionType({ cohortId, name, deadline: "08:15", weekdays });
}

function renderEdit(id: string) {
  return renderAsTeacher(`/submissions/${id}/edit`);
}

describe("読み込み", () => {
  it("いまの値を出す", async () => {
    const type = await add("音読カード", [1, 3, 5]);
    renderEdit(type.id);

    expect(await screen.findByLabelText("提出物の名前")).toHaveValue("音読カード");
    expect(screen.getByLabelText("締切時刻")).toHaveValue("08:15");
    expect(screen.getByRole("button", { name: "水" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "火" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("居ない提出物なら見つからないと伝える", async () => {
    renderEdit("missing");

    expect(
      await screen.findByText("この提出物は見つかりません"),
    ).toBeInTheDocument();
  });
});

describe("保存", () => {
  it("締切を変えられる", async () => {
    const user = userEvent.setup();
    const type = await add();
    renderEdit(type.id);

    const deadline = await screen.findByLabelText("締切時刻");
    await user.clear(deadline);
    await user.type(deadline, "08:30");
    await user.click(screen.getByRole("button", { name: "保存する" }));

    await screen.findByText("提出物1件・終了0");
    expect((await getSubmissionType(type.id))?.deadline).toBe("08:30");
  });

  it("他と名前が重なれば拒否する", async () => {
    const user = userEvent.setup();
    await add("計算ドリル");
    const second = await add("音読カード");
    renderEdit(second.id);

    const name = await screen.findByLabelText("提出物の名前");
    await user.clear(name);
    await user.type(name, "計算ドリル");
    await user.click(screen.getByRole("button", { name: "保存する" }));

    expect(
      await screen.findByText("計算ドリルはすでに登録されています"),
    ).toBeInTheDocument();
  });
});

describe("終了", () => {
  it("確認してから終了にする", async () => {
    const user = userEvent.setup();
    const type = await add();
    renderEdit(type.id);

    await user.click(await screen.findByRole("button", { name: "終了にする" }));

    // 「終了にする」は画面とダイアログの両方にあるためダイアログ内に絞る
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "終了にする" }));

    await screen.findByText("提出物0件・終了1");
    expect((await getSubmissionType(type.id))?.status).toBe("ended");
  });

  it("取り消せば何も起きない", async () => {
    const user = userEvent.setup();
    const type = await add();
    renderEdit(type.id);

    await user.click(await screen.findByRole("button", { name: "終了にする" }));
    await user.click(await screen.findByRole("button", { name: "やめる" }));

    expect((await getSubmissionType(type.id))?.status).toBe("active");
  });

  it("終了済みなら有効に戻せる", async () => {
    const user = userEvent.setup();
    const type = await add();
    await endSubmissionType(type.id);
    renderEdit(type.id);

    await user.click(await screen.findByRole("button", { name: "有効に戻す" }));

    await screen.findByText("提出物1件・終了0");
    expect((await getSubmissionType(type.id))?.status).toBe("active");
  });
});

describe("完全に削除", () => {
  it("確認したうえで削除する", async () => {
    const user = userEvent.setup();
    const type = await add();
    renderEdit(type.id);

    await user.click(await screen.findByRole("button", { name: "完全に削除" }));
    expect(
      await screen.findByText("この提出物の記録は元に戻せません"),
    ).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "削除する" }));

    await screen.findByText("まず提出物を追加してください");
    expect(await listSubmissionTypes(cohortId)).toHaveLength(0);
  });

  it("取り消せば消えない", async () => {
    const user = userEvent.setup();
    const type = await add();
    renderEdit(type.id);

    await user.click(await screen.findByRole("button", { name: "完全に削除" }));
    await user.click(await screen.findByRole("button", { name: "やめる" }));

    expect(await getSubmissionType(type.id)).not.toBeNull();
  });
});
