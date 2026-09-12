import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";
import { SetupGate } from "./components/SetupGate";
import { TeacherAuthProvider } from "./components/TeacherAuthProvider";
import { TeacherGate } from "./components/TeacherGate";
import { Calendar } from "./screens/Calendar";
import { Grading } from "./screens/Grading";
import { KidsScan } from "./screens/KidsScan";
import { Print } from "./screens/Print";
import { Roster } from "./screens/Roster";
import { UpdateBanner } from "./components/UpdateBanner";
import { Scan } from "./screens/Scan";
import { Settings } from "./screens/Settings";
import { SubmissionEdit } from "./screens/SubmissionEdit";
import { SubmissionList } from "./screens/SubmissionList";
import { SubmissionNew } from "./screens/SubmissionNew";
import { Setup } from "./screens/Setup";
import { StudentEdit } from "./screens/StudentEdit";
import { StudentHistory } from "./screens/StudentHistory";
import { StudentNew } from "./screens/StudentNew";
import { Unsubmitted } from "./screens/Unsubmitted";

export function AppRoutes() {
  return (
    <Routes>
      {/* 児童画面。鍵をかけない入口 */}
      <Route path="/" element={<KidsScan />} />

      {/*
        初期設定は鍵の外に置く。クラスもパスワードもまだ無い状態で開く画面のため。
        既存の SetupGate が、cohortがあるときは /roster へ送るので、
        子供がここを開いても名簿には届かない（/roster 側でガードが働く）。
      */}
      <Route
        path="/setup"
        element={
          <SetupGate>
            <Setup />
          </SetupGate>
        }
      />

      {/* ここから下はすべて教員用 */}
      <Route
        element={
          <TeacherGate>
            <Outlet />
          </TeacherGate>
        }
      >
        <Route path="/roster" element={<Roster />} />
        <Route path="/roster/new" element={<StudentNew />} />
        <Route path="/roster/:id/edit" element={<StudentEdit />} />
        <Route path="/roster/:id/history" element={<StudentHistory />} />
        <Route path="/print" element={<Print />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/submissions" element={<SubmissionList />} />
        <Route path="/submissions/new" element={<SubmissionNew />} />
        <Route path="/submissions/:id/edit" element={<SubmissionEdit />} />
        <Route path="/unsubmitted" element={<Unsubmitted />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/grading" element={<Grading />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <TeacherAuthProvider>
        <AppRoutes />
        <UpdateBanner />
      </TeacherAuthProvider>
    </BrowserRouter>
  );
}
