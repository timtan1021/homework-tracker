import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { AppRoutes } from "../App";
import { TeacherAuthProvider } from "../components/TeacherAuthProvider";
import { createCohort } from "../db/cohorts";
import { setTeacherPassword } from "../db/teacherAuth";

useFreshDb();

beforeEach(async () => {
  await createCohort({ year: 2026, className: "5年1組" });
  await setTeacherPassword("あさのかい");
});

function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/roster"]}>
      <TeacherAuthProvider>
        <AppRoutes />
      </TeacherAuthProvider>
    </MemoryRouter>,
  );
}

async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("パスワード"), "あさのかい");
  await user.click(screen.getByRole("button", { name: "入る" }));
}

describe("パスワード画面からの誤操作の復帰", () => {
  it("パスワードを入れず、こどもがめんへ で児童画面に戻れる", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(
      await screen.findByRole("button", { name: "← こどもがめんへ" }),
    );

    expect(await screen.findByRole("link", { name: "せんせい" })).toBeInTheDocument();
  });
});

describe("児童画面に戻ったあと", () => {
  it("もう一度名簿を開くとパスワードを求められる", async () => {
    const user = userEvent.setup();
    renderApp();

    await signIn(user);
    await screen.findByRole("button", { name: "児童画面に戻る" });

    await user.click(screen.getByRole("button", { name: "児童画面に戻る" }));
    await screen.findByRole("link", { name: "せんせい" });

    // 児童画面の「せんせい」から名簿へ戻る = ブラウザバックと同じ到達経路
    await user.click(screen.getByRole("link", { name: "せんせい" }));

    expect(await screen.findByLabelText("パスワード")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "児童画面に戻る" }),
    ).not.toBeInTheDocument();
  });
});
