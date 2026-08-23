import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { CohortGate, useActiveCohort } from "./components/CohortGate";
import { Setup } from "./screens/Setup";

/** Task 6 で本物の名簿画面に差し替える。 */
function RosterPlaceholder() {
  const cohort = useActiveCohort();
  return (
    <main className="p-6">
      <h1 className="font-display text-ai text-2xl">
        {cohort.year}年度 {cohort.className}
      </h1>
    </main>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/setup" element={<Setup />} />
      <Route
        path="/roster"
        element={
          <CohortGate>
            <RosterPlaceholder />
          </CohortGate>
        }
      />
      <Route path="*" element={<Navigate to="/roster" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
