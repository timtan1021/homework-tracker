import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { isTeacherPasswordSet } from "../db/teacherAuth";
import { useAsync } from "../hooks/useAsync";
import { TeacherLogin } from "../screens/TeacherLogin";
import { TeacherPasswordSetup } from "../screens/TeacherPasswordSetup";
import { FullScreenMessage } from "./FullScreenMessage";
import { useTeacherAuth } from "./TeacherAuthProvider";

/**
 * 教員ルートの入口。
 *
 * `showBackLink={false}` を渡すのは、既定の戻り先が `/roster` で、
 * それ自身がこのガードの内側にあるため。導線を出すとループする。
 */
export function TeacherGate({ children }: { children: ReactNode }) {
  const { authenticated, signIn } = useTeacherAuth();
  const state = useAsync(() => isTeacherPasswordSet(), "teacher-password-set");
  const navigate = useNavigate();
  const exitToKids = () => navigate("/");

  // セキュアコンテキストでなければ crypto.subtle が存在しない。
  // 児童画面のカメラも同じ制約で動かないため、条件は一致している。
  if (typeof globalThis.crypto?.subtle === "undefined") {
    return (
      <FullScreenMessage tone="error" showBackLink={false}>
        この画面を開くには https で接続してください。いまの接続では
        パスワードを確認できません
      </FullScreenMessage>
    );
  }

  if (authenticated) {
    return <>{children}</>;
  }

  if (state.status === "loading") {
    return <FullScreenMessage>読み込んでいます</FullScreenMessage>;
  }
  if (state.status === "error") {
    return (
      <FullScreenMessage tone="error" showBackLink={false}>
        {state.message}
      </FullScreenMessage>
    );
  }

  return state.data ? (
    <TeacherLogin onSuccess={signIn} onExit={exitToKids} />
  ) : (
    <TeacherPasswordSetup onDone={signIn} onExit={exitToKids} />
  );
}
