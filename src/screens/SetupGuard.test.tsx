import { useFreshDb } from "../test/db";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAsTeacher } from "../test/router";
import { createCohort, getActiveCohort } from "../db/cohorts";
import { addStudent, listStudents } from "../db/students";

useFreshDb();

function renderAt(path: string) {
  return renderAsTeacher(path);
}

describe("cohortがある状態で初回セットアップを開いたとき", () => {
  it("名簿へ送り返す", async () => {
    await createCohort({ year: 2026, className: "5年1組" });

    renderAt("/setup");

    expect(await screen.findByText("2026年度 5年1組")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "クラスをつくる" }),
    ).not.toBeInTheDocument();
  });

  it("生徒を消さない", async () => {
    const cohort = await createCohort({ year: 2026, className: "5年1組" });
    await addStudent({ cohortId: cohort.id, attendanceNumber: 1 });
    await addStudent({ cohortId: cohort.id, attendanceNumber: 2 });

    renderAt("/setup");

    // 名簿が描かれるまで待ってから、データが無事なことを確かめる
    expect(await screen.findByText("在籍2人・欠番0")).toBeInTheDocument();
    expect(await listStudents(cohort.id)).toHaveLength(2);
  });

  it("cohortを増やさない", async () => {
    const first = await createCohort({ year: 2026, className: "5年1組" });

    renderAt("/setup");
    await screen.findByText("2026年度 5年1組");

    // 有効なcohortが差し替わっていないこと（差し替わると名簿が空になる）
    expect((await getActiveCohort())?.id).toBe(first.id);
  });
});

describe("cohortが無い状態で初回セットアップを開いたとき", () => {
  it("そのまま表示する", async () => {
    renderAt("/setup");

    expect(
      await screen.findByRole("heading", { name: "クラスをつくる" }),
    ).toBeInTheDocument();
  });
});
