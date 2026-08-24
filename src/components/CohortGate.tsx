import { createContext, use, type ReactNode } from "react";
import { Navigate } from "react-router";
import { getActiveCohort } from "../db/cohorts";
import type { Cohort } from "../db/schema";
import { useAsync } from "../hooks/useAsync";
import { FullScreenMessage } from "./FullScreenMessage";

const CohortContext = createContext<Cohort | null>(null);

/** CohortGate の内側でのみ使える。有効なcohortを返す。 */
export function useActiveCohort(): Cohort {
  const cohort = use(CohortContext);
  if (cohort === null) {
    throw new Error("useActiveCohort は CohortGate の中でのみ使えます");
  }
  return cohort;
}

export function CohortGate({ children }: { children: ReactNode }) {
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
  if (state.data === null) {
    return <Navigate to="/setup" replace />;
  }

  return <CohortContext value={state.data}>{children}</CohortContext>;
}
