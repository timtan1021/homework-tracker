import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { SetupGate } from "./components/SetupGate";
import { Print } from "./screens/Print";
import { Roster } from "./screens/Roster";
import { Scan } from "./screens/Scan";
import { Settings } from "./screens/Settings";
import { SubmissionEdit } from "./screens/SubmissionEdit";
import { SubmissionList } from "./screens/SubmissionList";
import { SubmissionNew } from "./screens/SubmissionNew";
import { Setup } from "./screens/Setup";
import { StudentEdit } from "./screens/StudentEdit";
import { StudentNew } from "./screens/StudentNew";

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/setup"
        element={
          <SetupGate>
            <Setup />
          </SetupGate>
        }
      />
      <Route path="/roster" element={<Roster />} />
      <Route path="/roster/new" element={<StudentNew />} />
      <Route path="/roster/:id/edit" element={<StudentEdit />} />
      <Route path="/print" element={<Print />} />
      <Route path="/scan" element={<Scan />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/submissions" element={<SubmissionList />} />
      <Route path="/submissions/new" element={<SubmissionNew />} />
      <Route path="/submissions/:id/edit" element={<SubmissionEdit />} />
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
