import { createContext, use, useMemo, useState, type ReactNode } from "react";

export type TeacherAuthValue = {
  authenticated: boolean;
  signIn: () => void;
  signOut: () => void;
};

/**
 * テストが認証済み状態を作るための唯一の口。
 *
 * `TeacherAuthProvider` に `initialAuthenticated` のような prop は持たせない。
 * 本番のコンポーネントに認証を素通りさせる引数を作ると、いつか本番の
 * 呼び出し側で渡される。テストは Provider を使わず Context に値を直接与える。
 */
export const TeacherAuthContext = createContext<TeacherAuthValue | null>(null);

/** TeacherAuthProvider の内側でのみ使える。 */
export function useTeacherAuth(): TeacherAuthValue {
  const value = use(TeacherAuthContext);
  if (value === null) {
    throw new Error("useTeacherAuth は TeacherAuthProvider の中でのみ使えます");
  }
  return value;
}

export function TeacherAuthProvider({ children }: { children: ReactNode }) {
  // 認証状態はメモリだけに置く。sessionStorage にも localStorage にも
  // 書かない。「リロードとアプリの再起動で解除される」という要件が、
  // 何も書かないことによって満たされる。保存する仕組みを足せば、
  // 解除する仕組みも足さねばならない。
  const [authenticated, setAuthenticated] = useState(false);

  const value = useMemo<TeacherAuthValue>(
    () => ({
      authenticated,
      signIn: () => setAuthenticated(true),
      signOut: () => setAuthenticated(false),
    }),
    [authenticated],
  );

  return <TeacherAuthContext value={value}>{children}</TeacherAuthContext>;
}
