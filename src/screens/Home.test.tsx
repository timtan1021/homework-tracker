import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { AppRoutes } from "../App";
import { TeacherAuthProvider } from "../components/TeacherAuthProvider";
import { createCohort } from "../db/cohorts";
import { addSubmissionType } from "../db/submissionTypes";

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
      <TeacherAuthProvider>
        <AppRoutes />
      </TeacherAuthProvider>
    </MemoryRouter>,
  );
}

describe("入口", () => {
  it("/ は児童画面", async () => {
    await addSubmissionType({
      cohortId,
      name: "けいさんドリル",
      deadline: "08:15",
      weekdays: [TODAY.getDay()],
    });

    renderAt("/");

    expect(
      await screen.findByRole("link", { name: "せんせい" }),
    ).toBeInTheDocument();
  });

  it("知らないパスは児童画面へ送る", async () => {
    await addSubmissionType({
      cohortId,
      name: "けいさんドリル",
      deadline: "08:15",
      weekdays: [TODAY.getDay()],
    });

    renderAt("/unknown");

    expect(
      await screen.findByRole("link", { name: "せんせい" }),
    ).toBeInTheDocument();
  });

  it("提出物が無くても行き止まりにしない", async () => {
    renderAt("/");

    expect(
      await screen.findByText("きょうは だすものが ありません"),
    ).toBeInTheDocument();
  });
});

describe("教員ルートの守り", () => {
  it("認証していなければ名簿を開けない", async () => {
    renderAt("/roster");

    // パスワード未設定なので設定画面が出る。名簿は出ない。
    expect(
      await screen.findByText("先生用のパスワードを決めてください"),
    ).toBeInTheDocument();
  });

  it("認証していなければ集計を開けない", async () => {
    renderAt("/unsubmitted");

    expect(
      await screen.findByText("先生用のパスワードを決めてください"),
    ).toBeInTheDocument();
  });

  it("認証していなければ設定を開けない", async () => {
    renderAt("/settings");

    expect(
      await screen.findByText("先生用のパスワードを決めてください"),
    ).toBeInTheDocument();
  });

  it("/setup は守らない（クラスもパスワードも無い状態で通る道）", async () => {
    // cohort があるので SetupGate が /roster へ送り、そこでガードが働く
    renderAt("/setup");

    expect(
      await screen.findByText("先生用のパスワードを決めてください"),
    ).toBeInTheDocument();
  });
});
