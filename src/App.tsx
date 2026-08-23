import { currentSchoolYear } from "./lib/schoolYear";

export function App() {
  return (
    <main className="p-6">
      <h1 className="font-display text-ai text-3xl">宿題提出管理</h1>
      <p className="mt-2 font-num text-2xl">{currentSchoolYear()}年度</p>
    </main>
  );
}
