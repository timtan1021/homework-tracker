import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { renderAsTeacher } from "../test/router";
import { createCohort } from "../db/cohorts";
import {
  addSubmissionType,
  endSubmissionType,
  listSubmissionTypes,
} from "../db/submissionTypes";

useFreshDb();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function renderNew() {
  return renderAsTeacher("/submissions/new");
}

describe("初期値", () => {
  it("締切は8:15から始まる", async () => {
    renderNew();

    expect(await screen.findByLabelText("締切時刻")).toHaveValue("08:15");
  });

  it("曜日は月から金が選ばれている", async () => {
    renderNew();

    await screen.findByLabelText("締切時刻");
    for (const label of ["月", "火", "水", "木", "金"]) {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
    for (const label of ["日", "土"]) {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
  });
});

describe("保存", () => {
  it("保存すると一覧に戻り件数が増える", async () => {
    const user = userEvent.setup();
    renderNew();

    await user.type(await screen.findByLabelText("提出物の名前"), "計算ドリル");
    await user.click(screen.getByRole("button", { name: "保存する" }));

    expect(await screen.findByText("提出物1件・終了0")).toBeInTheDocument();
    expect(await listSubmissionTypes(cohortId)).toHaveLength(1);
  });

  it("続けて追加すると画面に留まり入力欄が空になる", async () => {
    const user = userEvent.setup();
    renderNew();

    await user.type(await screen.findByLabelText("提出物の名前"), "計算ドリル");
    await user.click(
      screen.getByRole("button", { name: "保存して続けて追加" }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("提出物の名前")).toHaveValue("");
    });
    expect(await listSubmissionTypes(cohortId)).toHaveLength(1);
  });

  it("曜日を変えて保存できる", async () => {
    const user = userEvent.setup();
    renderNew();

    await user.type(await screen.findByLabelText("提出物の名前"), "日記");
    await user.click(screen.getByRole("button", { name: "火" }));
    await user.click(screen.getByRole("button", { name: "水" }));
    await user.click(screen.getByRole("button", { name: "木" }));
    await user.click(screen.getByRole("button", { name: "金" }));
    await user.click(screen.getByRole("button", { name: "保存する" }));

    await screen.findByText("提出物1件・終了0");
    const types = await listSubmissionTypes(cohortId);
    expect(types[0].weekdays).toEqual([1]);
  });
});

describe("入力の検証", () => {
  it("名前が空ならエラーを出し保存しない", async () => {
    const user = userEvent.setup();
    renderNew();

    await user.click(await screen.findByRole("button", { name: "保存する" }));

    expect(
      await screen.findByText("提出物の名前を入力してください"),
    ).toBeInTheDocument();
    expect(await listSubmissionTypes(cohortId)).toHaveLength(0);
  });

  it("曜日をすべて外すとエラーを出す", async () => {
    const user = userEvent.setup();
    renderNew();

    await user.type(await screen.findByLabelText("提出物の名前"), "日記");
    for (const label of ["月", "火", "水", "木", "金"]) {
      await user.click(screen.getByRole("button", { name: label }));
    }
    await user.click(screen.getByRole("button", { name: "保存する" }));

    expect(
      await screen.findByText("提出する曜日を1つ以上選んでください"),
    ).toBeInTheDocument();
  });

  it("31文字目からは入力できない", async () => {
    const user = userEvent.setup();
    renderNew();

    const input = await screen.findByLabelText("提出物の名前");
    await user.type(input, "あ".repeat(31));

    expect(input).toHaveValue("あ".repeat(30));
  });

  it("名前が重複すればエラーを出す", async () => {
    const user = userEvent.setup();
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [1, 2, 3, 4, 5],
    });
    renderNew();

    await user.type(await screen.findByLabelText("提出物の名前"), "計算ドリル");
    await user.click(screen.getByRole("button", { name: "保存する" }));

    expect(
      await screen.findByText("計算ドリルはすでに登録されています"),
    ).toBeInTheDocument();
  });

  it("終了したものと重複すれば理由を示す", async () => {
    const user = userEvent.setup();
    const type = await addSubmissionType({
      cohortId,
      name: "日記",
      deadline: "08:15",
      weekdays: [1],
    });
    await endSubmissionType(type.id);
    renderNew();

    await user.type(await screen.findByLabelText("提出物の名前"), "日記");
    await user.click(screen.getByRole("button", { name: "保存する" }));

    expect(
      await screen.findByText("日記は終了した提出物として登録されています"),
    ).toBeInTheDocument();
  });
});
