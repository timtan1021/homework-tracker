import { useFreshDb } from "../test/db";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { AppRoutes } from "../App";
import { createCohort } from "../db/cohorts";
import { getSetting } from "../db/settings";
import { addStudent } from "../db/students";

useFreshDb();

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

describe("設定画面", () => {
  it("氏名を表示するトグルが最初はOFF", async () => {
    renderAt("/settings");
    expect(await screen.findByRole("checkbox", { name: "氏名を表示する" })).not.toBeChecked();
  });

  it("トグルを入れると保存される", async () => {
    const user = userEvent.setup();
    renderAt("/settings");

    await user.click(await screen.findByRole("checkbox", { name: "氏名を表示する" }));

    expect(await getSetting("showStudentNames")).toBe(true);
  });

  it("名簿から設定に入れる", async () => {
    const user = userEvent.setup();
    renderAt("/roster");

    await user.click(await screen.findByRole("link", { name: "設定" }));

    expect(
      await screen.findByRole("heading", { name: "設定" }),
    ).toBeInTheDocument();
  });
});

describe("氏名の表示は名簿と印刷の両方に効く", () => {
  it("ONにすると名簿に氏名が出る", async () => {
    const user = userEvent.setup();
    await addStudent({ cohortId, attendanceNumber: 1, name: "やまだ" });

    renderAt("/settings");
    await user.click(await screen.findByRole("checkbox", { name: "氏名を表示する" }));
    await user.click(screen.getByRole("link", { name: "名簿に戻る" }));

    expect(await screen.findByText("やまだ")).toBeInTheDocument();
  });

  it("ONにすると印刷シートに氏名が出る", async () => {
    const user = userEvent.setup();
    await addStudent({ cohortId, attendanceNumber: 1, name: "やまだ" });

    renderAt("/settings");
    await user.click(await screen.findByRole("checkbox", { name: "氏名を表示する" }));
    await user.click(screen.getByRole("link", { name: "名簿に戻る" }));
    await user.click(await screen.findByRole("link", { name: "QRを印刷" }));

    expect(await screen.findByText("やまだ")).toBeInTheDocument();
  });
});
