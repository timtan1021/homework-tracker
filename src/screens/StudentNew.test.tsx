import { useFreshDb } from "../test/db";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { renderAsTeacher } from "../test/router";
import { createCohort } from "../db/cohorts";
import { setSetting } from "../db/settings";
import { addStudent, listStudents, transferOutStudent } from "../db/students";

useFreshDb();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function renderNew() {
  return renderAsTeacher("/roster/new");
}

describe("出席番号の初期値", () => {
  it("生徒が居なければ1", async () => {
    renderNew();
    expect(await screen.findByLabelText("出席番号")).toHaveValue(1);
  });

  it("最大の番号の次になる", async () => {
    await addStudent({ cohortId, attendanceNumber: 1 });
    await addStudent({ cohortId, attendanceNumber: 8 });

    renderNew();
    expect(await screen.findByLabelText("出席番号")).toHaveValue(9);
  });

  it("転出した生徒の番号も数える", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 34 });
    await transferOutStudent(student.id);

    renderNew();
    expect(await screen.findByLabelText("出席番号")).toHaveValue(35);
  });
});

describe("保存", () => {
  it("保存すると名簿に戻り生徒が増える", async () => {
    const user = userEvent.setup();
    renderNew();

    await user.click(await screen.findByRole("button", { name: "保存する" }));

    expect(await screen.findByText("在籍1人・欠番0")).toBeInTheDocument();
    expect(await listStudents(cohortId)).toHaveLength(1);
  });

  it("続けて追加すると画面に留まり番号が次に進む", async () => {
    const user = userEvent.setup();
    renderNew();

    await user.click(
      await screen.findByRole("button", { name: "保存して続けて追加" }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("出席番号")).toHaveValue(2);
    });
    expect(await listStudents(cohortId)).toHaveLength(1);
  });
});

describe("入力の検証", () => {
  it("在籍中の番号と重なればエラーを出し保存しない", async () => {
    const user = userEvent.setup();
    await addStudent({ cohortId, attendanceNumber: 12 });
    renderNew();

    const numberField = await screen.findByLabelText("出席番号");
    fireEvent.change(numberField, { target: { value: "12" } });
    await user.click(screen.getByRole("button", { name: "保存する" }));

    expect(
      await screen.findByText("出席番号12はすでに使われています"),
    ).toBeInTheDocument();
    expect(await listStudents(cohortId)).toHaveLength(1);
  });

  it("転出した生徒の欠番と重なれば理由を示す", async () => {
    const user = userEvent.setup();
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    await transferOutStudent(student.id);
    renderNew();

    const numberField = await screen.findByLabelText("出席番号");
    fireEvent.change(numberField, { target: { value: "12" } });
    await user.click(screen.getByRole("button", { name: "保存する" }));

    expect(
      await screen.findByText("12番は転出した生徒の欠番です"),
    ).toBeInTheDocument();
  });

  it("0以下ならエラーを出す", async () => {
    const user = userEvent.setup();
    renderNew();

    const numberField = await screen.findByLabelText("出席番号");
    fireEvent.change(numberField, { target: { value: "0" } });
    await user.click(screen.getByRole("button", { name: "保存する" }));

    expect(
      await screen.findByText("出席番号は1以上の数字で入力してください"),
    ).toBeInTheDocument();
  });
});

describe("氏名欄", () => {
  it("設定がOFFなら出さない", async () => {
    renderNew();
    await screen.findByLabelText("出席番号");
    expect(screen.queryByLabelText("氏名")).not.toBeInTheDocument();
  });

  it("設定がONなら出して保存できる", async () => {
    const user = userEvent.setup();
    await setSetting("showStudentNames", true);
    renderNew();

    await user.type(await screen.findByLabelText("氏名"), "やまだ");
    await user.click(screen.getByRole("button", { name: "保存する" }));

    await screen.findByText("在籍1人・欠番0");
    const students = await listStudents(cohortId);
    expect(students[0].name).toBe("やまだ");
  });

  it("21文字目からは入力できない", async () => {
    const user = userEvent.setup();
    await setSetting("showStudentNames", true);
    renderNew();

    const input = await screen.findByLabelText("氏名");
    await user.type(input, "あ".repeat(21));

    expect(input).toHaveValue("あ".repeat(20));
  });
});
