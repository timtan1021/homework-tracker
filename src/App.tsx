import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Roster } from "./screens/Roster";
import { Setup } from "./screens/Setup";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/setup" element={<Setup />} />
      <Route path="/roster" element={<Roster />} />
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
