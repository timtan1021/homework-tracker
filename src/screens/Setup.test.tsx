import { useFreshDb } from "../test/db";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AppRoutes } from "../App";
import { getActiveCohort } from "../db/cohorts";

useFreshDb();

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("初回セットアップ", () => {
  it("cohortが無いとき名簿を開くとセットアップに送られる", async () => {
    renderAt("/roster");
    expect(
      await screen.findByRole("heading", { name: "クラスをつくる" }),
    ).toBeInTheDocument();
  });

  it("年度の初期値が現在の学校年度になっている", async () => {
    renderAt("/setup");
    const year = await screen.findByLabelText("年度");
    expect(year).toHaveValue(2026);
  });

  it("クラス名が空なら保存せずエラーを出す", async () => {
    const user = userEvent.setup();
    renderAt("/setup");

    await user.click(await screen.findByRole("button", { name: "クラスをつくる" }));

    expect(await screen.findByText("クラス名を入力してください")).toBeInTheDocument();
    expect(await getActiveCohort()).toBeNull();
  });

  it("入力して保存するとcohortが作られ名簿に移る", async () => {
    const user = userEvent.setup();
    renderAt("/setup");

    await user.type(await screen.findByLabelText("クラス名"), "5年1組");
    await user.click(screen.getByRole("button", { name: "クラスをつくる" }));

    expect(await screen.findByText("2026年度 5年1組")).toBeInTheDocument();

    const cohort = await getActiveCohort();
    expect(cohort?.className).toBe("5年1組");
    expect(cohort?.year).toBe(2026);
  });
});
