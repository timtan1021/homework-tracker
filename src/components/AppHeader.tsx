import { Link, useNavigate } from "react-router";
import type { Cohort } from "../db/schema";
import { useTeacherAuth } from "./TeacherAuthProvider";

export function AppHeader({
  cohort,
  subtitle,
}: {
  cohort: Cohort;
  subtitle: string;
}) {
  const navigate = useNavigate();
  const { signOut } = useTeacherAuth();

  return (
    <header className="border-kogan flex items-start justify-between gap-3 border-b pb-3">
      <div>
        <h1 className="font-display text-ai text-2xl">
          {cohort.year}年度 {cohort.className}
        </h1>
        <p className="mt-1 text-sm">{subtitle}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {/*
          子供に端末を渡す前に押す。認証を捨ててから移るので、
          ブラウザの戻るボタンで戻っても TeacherGate が守る。
        */}
        <button
          type="button"
          onClick={() => {
            signOut();
            void navigate("/");
          }}
          className="text-ai min-h-11 px-2 text-sm font-bold underline"
        >
          児童画面に戻る
        </button>

        {/* タブレットを片手で持って押すため、44px四方のタップ領域を確保する */}
        <Link
          to="/settings"
          aria-label="設定"
          className="text-ai flex size-11 shrink-0 items-center justify-center text-xl"
        >
          ⚙
        </Link>
      </div>
    </header>
  );
}
