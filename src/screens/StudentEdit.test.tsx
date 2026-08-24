import { useFreshDb } from "../test/db";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { AppRoutes } from "../App";
import { createCohort } from "../db/cohorts";
import { setSetting } from "../db/settings";
import {
  addStudent,
  getStudent,
  listStudents,
  transferOutStudent,
} from "../db/students";

useFreshDb();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function renderEdit(studentId: string) {
  return render(
    <MemoryRouter initialEntries={[`/roster/${studentId}/edit`]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("読み込み", () => {
  it("いまの出席番号を表示する", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    renderEdit(student.id);

    expect(await screen.findByLabelText("出席番号")).toHaveValue(12);
  });

  it("居ない生徒なら見つからないと伝える", async () => {
    renderEdit("missing");
    expect(await screen.findByText("この生徒は見つかりません")).toBeInTheDocument();
  });
});

describe("保存", () => {
  it("出席番号を変えられる", async () => {
    const user = userEvent.setup();
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    renderEdit(student.id);

    const numberField = await screen.findByLabelText("出席番号");
    fireEvent.change(numberField, { target: { value: "7" } });
    await user.click(screen.getByRole("button", { name: "保存する" }));

    await screen.findByText("在籍1人・欠番0");
    expect((await getStudent(student.id))?.attendanceNumber).toBe(7);
  });

  it("他の生徒の番号と重なれば拒否する", async () => {
    const user = userEvent.setup();
    await addStudent({ cohortId, attendanceNumber: 1 });
    const second = await addStudent({ cohortId, attendanceNumber: 2 });
    renderEdit(second.id);

    const numberField = await screen.findByLabelText("出席番号");
    fireEvent.change(numberField, { target: { value: "1" } });
    await user.click(screen.getByRole("button", { name: "保存する" }));

    expect(
      await screen.findByText("出席番号1はすでに使われています"),
    ).toBeInTheDocument();
    expect((await getStudent(second.id))?.attendanceNumber).toBe(2);
  });

  it("氏名の設定がONなら氏名を変えられる", async () => {
    const user = userEvent.setup();
    await setSetting("showStudentNames", true);
    const student = await addStudent({ cohortId, attendanceNumber: 1 });
    renderEdit(student.id);

    await user.type(await screen.findByLabelText("氏名"), "やまだ");
    await user.click(screen.getByRole("button", { name: "保存する" }));

    await screen.findByText("在籍1人・欠番0");
    expect((await getStudent(student.id))?.name).toBe("やまだ");
  });
});

describe("転出", () => {
  it("確認してから転出し番号は欠番として残る", async () => {
    const user = userEvent.setup();
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    renderEdit(student.id);

    await user.click(await screen.findByRole("button", { name: "転出にする" }));

    // 「転出にする」は画面とダイアログの両方にあるためダイアログ内に絞る
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "転出にする" }));

    await screen.findByText("在籍0人・欠番1");
    const updated = await getStudent(student.id);
    expect(updated?.status).toBe("transferredOut");
    expect(updated?.attendanceNumber).toBe(12);
  });

  it("確認を取り消せば何も起きない", async () => {
    const user = userEvent.setup();
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    renderEdit(student.id);

    await user.click(await screen.findByRole("button", { name: "転出にする" }));
    await user.click(await screen.findByRole("button", { name: "やめる" }));

    expect((await getStudent(student.id))?.status).toBe("active");
  });

  it("転出済みなら在籍に戻せる", async () => {
    const user = userEvent.setup();
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    await transferOutStudent(student.id);
    renderEdit(student.id);

    await user.click(await screen.findByRole("button", { name: "在籍に戻す" }));

    await screen.findByText("在籍1人・欠番0");
    expect((await getStudent(student.id))?.status).toBe("active");
  });
});

describe("完全に削除", () => {
  it("確認したうえで削除し番号が空く", async () => {
    const user = userEvent.setup();
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    renderEdit(student.id);

    await user.click(await screen.findByRole("button", { name: "完全に削除" }));
    expect(
      await screen.findByText("この生徒の記録は元に戻せません"),
    ).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "削除する" }));

    await screen.findByText("まず出席番号を追加してください");
    expect(await listStudents(cohortId)).toHaveLength(0);
  });

  it("確認を取り消せば消えない", async () => {
    const user = userEvent.setup();
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    renderEdit(student.id);

    await user.click(await screen.findByRole("button", { name: "完全に削除" }));
    await user.click(await screen.findByRole("button", { name: "やめる" }));

    expect(await getStudent(student.id)).not.toBeNull();
  });
});
