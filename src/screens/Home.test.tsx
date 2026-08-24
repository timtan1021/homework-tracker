import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { useFreshDb } from "../test/db";
import { AppRoutes } from "../App";
import { createCohort } from "../db/cohorts";
import { addSubmissionType } from "../db/submissionTypes";
import { formatDateHeading } from "../lib/date";

useFreshDb();

const TODAY = new Date();

let cohortId = "";

beforeEach(async () => {
  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("知らないパスを開いたとき", () => {
  it("提出チェックへ送る", async () => {
    await addSubmissionType({
      cohortId,
      name: "計算ドリル",
      deadline: "08:15",
      weekdays: [TODAY.getDay()],
    });

    renderAt("/");

    expect(
      await screen.findByText(formatDateHeading(TODAY)),
    ).toBeInTheDocument();
  });

  it("提出物が無くても行き止まりにしない", async () => {
    // 分岐を入れない代わりに、スキャン画面が空の状態を引き受ける。
    renderAt("/");

    expect(
      await screen.findByText("まず提出物を登録してください"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "提出物の設定" }),
    ).toHaveAttribute("href", "/submissions");
  });
});
