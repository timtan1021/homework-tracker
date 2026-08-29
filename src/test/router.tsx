import { render, type RenderResult } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AppRoutes } from "../App";
import { TeacherAuthContext } from "../components/TeacherAuthProvider";

/**
 * 認証済みの状態で教員ルートを開く。
 *
 * Provider ではなく Context に直接値を与える。本番の
 * TeacherAuthProvider に認証を素通りさせる prop を持たせないため。
 */
export function renderAsTeacher(path: string): RenderResult {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TeacherAuthContext
        value={{ authenticated: true, signIn: () => {}, signOut: () => {} }}
      >
        <AppRoutes />
      </TeacherAuthContext>
    </MemoryRouter>,
  );
}
