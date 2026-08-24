import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { getActiveCohort } from "../db/cohorts";
import { useAsync } from "../hooks/useAsync";
import { FullScreenMessage } from "./FullScreenMessage";

/**
 * `CohortGate` の逆向きのガード。
 *
 * cohortがすでに存在するなら初回セットアップは開かせず名簿へ送る。
 * `createCohort` は既存のcohortを無効化するため、初回セットアップ時に
 * ホーム画面へ追加したショートカット等から再度 `/setup` を開くと、
 * 確認も取り消しもないまま名簿の生徒が全員消える。このフェーズには
 * cohortの切り替え画面が無いので復旧できない。
 *
 * `CohortGate` を再利用してはいけない。あれは逆向きに送るのでループする。
 */
export function SetupGate({ children }: { children: ReactNode }) {
  const state = useAsync(() => getActiveCohort(), "active-cohort");

  if (state.status === "loading") {
    return <FullScreenMessage>読み込んでいます</FullScreenMessage>;
  }
  if (state.status === "error") {
    // ストレージが使えない状態では名簿も開けないため戻る導線を出さない
    return (
      <FullScreenMessage tone="error" showBackLink={false}>
        {state.message}
      </FullScreenMessage>
    );
  }
  if (state.data !== null) {
    return <Navigate to="/roster" replace />;
  }

  return <>{children}</>;
}
