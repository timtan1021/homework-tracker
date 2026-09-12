import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { createCohort } from "./cohorts";
import { ValidationError } from "./errors";
import {
  addStudent,
  deleteStudent,
  getStudent,
  listStudents,
  nextAttendanceNumber,
  restoreStudent,
  transferOutStudent,
  updateStudent,
} from "./students";

useFreshDb();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

describe("nextAttendanceNumber", () => {
  it("生徒が居なければ 1", async () => {
    expect(await nextAttendanceNumber(cohortId)).toBe(1);
  });

  it("最大の出席番号の次を返す", async () => {
    await addStudent({ cohortId, attendanceNumber: 1 });
    await addStudent({ cohortId, attendanceNumber: 5 });
    expect(await nextAttendanceNumber(cohortId)).toBe(6);
  });

  it("転出した生徒の番号も最大値の計算に含める", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 34 });
    await transferOutStudent(student.id);
    expect(await nextAttendanceNumber(cohortId)).toBe(35);
  });
});

describe("addStudent", () => {
  it("在籍として登録し氏名は空文字で始まる", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 1 });
    expect(student.status).toBe("active");
    expect(student.name).toBe("");
    expect(student.attendanceNumber).toBe(1);
  });

  it("氏名の前後の空白を取り除く", async () => {
    const student = await addStudent({
      cohortId,
      attendanceNumber: 1,
      name: "  やまだ  ",
    });
    expect(student.name).toBe("やまだ");
  });

  it("氏名が長すぎれば拒否する", async () => {
    await expect(
      addStudent({ cohortId, attendanceNumber: 1, name: "あ".repeat(21) }),
    ).rejects.toThrow(new ValidationError("氏名は20文字以内で入力してください"));
  });

  it("在籍中の生徒と番号が重なれば拒否する", async () => {
    await addStudent({ cohortId, attendanceNumber: 12 });
    await expect(
      addStudent({ cohortId, attendanceNumber: 12 }),
    ).rejects.toThrow(new ValidationError("出席番号12はすでに使われています"));
  });

  it("転出した生徒の欠番と重なれば理由を示して拒否する", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    await transferOutStudent(student.id);
    await expect(
      addStudent({ cohortId, attendanceNumber: 12 }),
    ).rejects.toThrow(new ValidationError("12番は転出した生徒の欠番です"));
  });

  it("0以下の番号を拒否する", async () => {
    await expect(addStudent({ cohortId, attendanceNumber: 0 })).rejects.toThrow(
      new ValidationError("出席番号は1以上の数字で入力してください"),
    );
  });

  it("整数でない番号を拒否する", async () => {
    await expect(
      addStudent({ cohortId, attendanceNumber: 1.5 }),
    ).rejects.toThrow(
      new ValidationError("出席番号は1以上の数字で入力してください"),
    );
  });

  it("別のcohortとは番号が重なってもよい", async () => {
    const other = await createCohort({ year: 2025, className: "4年1組" });
    await addStudent({ cohortId: other.id, attendanceNumber: 1 });
    const student = await addStudent({ cohortId, attendanceNumber: 1 });
    expect(student.attendanceNumber).toBe(1);
  });
});

describe("listStudents", () => {
  it("出席番号の昇順で返す", async () => {
    await addStudent({ cohortId, attendanceNumber: 3 });
    await addStudent({ cohortId, attendanceNumber: 1 });
    await addStudent({ cohortId, attendanceNumber: 2 });

    const numbers = (await listStudents(cohortId)).map((s) => s.attendanceNumber);
    expect(numbers).toEqual([1, 2, 3]);
  });

  it("転出した生徒も含めて返す", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 1 });
    await transferOutStudent(student.id);
    expect(await listStudents(cohortId)).toHaveLength(1);
  });

  it("他のcohortの生徒を含めない", async () => {
    const other = await createCohort({ year: 2025, className: "4年1組" });
    await addStudent({ cohortId: other.id, attendanceNumber: 1 });
    expect(await listStudents(cohortId)).toHaveLength(0);
  });
});

describe("updateStudent", () => {
  it("出席番号と氏名を変更できる", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 1 });
    const updated = await updateStudent(student.id, {
      attendanceNumber: 7,
      name: "やまだ",
    });

    expect(updated.attendanceNumber).toBe(7);
    expect(updated.name).toBe("やまだ");
  });

  it("氏名が長すぎれば拒否する", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 1 });
    await expect(
      updateStudent(student.id, {
        attendanceNumber: 1,
        name: "あ".repeat(21),
      }),
    ).rejects.toThrow(new ValidationError("氏名は20文字以内で入力してください"));
  });

  it("内部IDは変わらない", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 1 });
    const updated = await updateStudent(student.id, {
      attendanceNumber: 7,
      name: "",
    });
    expect(updated.id).toBe(student.id);
  });

  it("自分自身の番号のままなら通す", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 1 });
    const updated = await updateStudent(student.id, {
      attendanceNumber: 1,
      name: "やまだ",
    });
    expect(updated.attendanceNumber).toBe(1);
  });

  it("他の生徒の番号と重なれば拒否する", async () => {
    await addStudent({ cohortId, attendanceNumber: 1 });
    const second = await addStudent({ cohortId, attendanceNumber: 2 });

    await expect(
      updateStudent(second.id, { attendanceNumber: 1, name: "" }),
    ).rejects.toThrow(new ValidationError("出席番号1はすでに使われています"));
  });
});

describe("transferOutStudent と restoreStudent", () => {
  it("転出しても番号は欠番として残る", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    const out = await transferOutStudent(student.id);

    expect(out.status).toBe("transferredOut");
    expect(out.attendanceNumber).toBe(12);
    await expect(
      addStudent({ cohortId, attendanceNumber: 12 }),
    ).rejects.toThrow(ValidationError);
  });

  it("在籍に戻せる", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    await transferOutStudent(student.id);
    const restored = await restoreStudent(student.id);
    expect(restored.status).toBe("active");
  });
});

describe("deleteStudent", () => {
  it("削除すると一覧から消える", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 1 });
    await deleteStudent(student.id);

    expect(await getStudent(student.id)).toBeNull();
    expect(await listStudents(cohortId)).toHaveLength(0);
  });

  it("削除した番号は再利用できる", async () => {
    const student = await addStudent({ cohortId, attendanceNumber: 12 });
    await deleteStudent(student.id);

    const reused = await addStudent({ cohortId, attendanceNumber: 12 });
    expect(reused.attendanceNumber).toBe(12);
    expect(reused.id).not.toBe(student.id);
  });
});

describe("存在しない生徒の操作", () => {
  it("getStudent は null を返す", async () => {
    expect(await getStudent("missing")).toBeNull();
  });

  it("updateStudent は拒否する", async () => {
    await expect(
      updateStudent("missing", { attendanceNumber: 1, name: "" }),
    ).rejects.toThrow(new ValidationError("この生徒は見つかりません"));
  });
});
