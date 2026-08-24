import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Print } from "./screens/Print";
import { Roster } from "./screens/Roster";
import { Settings } from "./screens/Settings";
import { Setup } from "./screens/Setup";
import { StudentEdit } from "./screens/StudentEdit";
import { StudentNew } from "./screens/StudentNew";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/setup" element={<Setup />} />
      <Route path="/roster" element={<Roster />} />
      <Route path="/roster/new" element={<StudentNew />} />
      <Route path="/roster/:id/edit" element={<StudentEdit />} />
      <Route path="/print" element={<Print />} />
      <Route path="/settings" element={<Settings />} />
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
