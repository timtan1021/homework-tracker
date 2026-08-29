import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "./AppHeader";
import { TeacherAuthContext } from "./TeacherAuthProvider";

const COHORT = {
  id: "c1",
  year: 2026,
  className: "5年1組",
  isActive: true,
  createdAt: 0,
};

function renderHeader(signOut: () => void) {
  return render(
    <MemoryRouter>
      <TeacherAuthContext
        value={{ authenticated: true, signIn: () => {}, signOut }}
      >
        <AppHeader cohort={COHORT} subtitle="34人" />
      </TeacherAuthContext>
    </MemoryRouter>,
  );
}

describe("AppHeader", () => {
  it("児童画面に戻ると認証を捨てる", async () => {
    const user = userEvent.setup();
    const signOut = vi.fn();
    renderHeader(signOut);

    await user.click(screen.getByRole("button", { name: "児童画面に戻る" }));

    expect(signOut).toHaveBeenCalledOnce();
  });
});
