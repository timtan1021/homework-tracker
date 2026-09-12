import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { CameraView } from "../components/CameraView";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { DateStepper } from "../components/DateStepper";
import { FullScreenMessage } from "../components/FullScreenMessage";
import { NumberPad } from "../components/NumberPad";
import { ScanResult } from "../components/ScanResult";
import { SubmissionToggleBar } from "../components/SubmissionToggleBar";
import {
  recordSubmission,
  withdrawSubmission,
  type RecordResult,
} from "../db/submissions";
import { isDueOn } from "../db/submissionTypes";
import { useStudents } from "../hooks/useStudents";
import { useSubmissions } from "../hooks/useSubmissions";
import { useQrCamera } from "../hooks/useQrCamera";
import { useSubmissionTypes } from "../hooks/useSubmissionTypes";
import { dateFromKey, formatDateHeading, toDateKey } from "../lib/date";
import { parseQrPayload } from "../lib/qr";

const DATE_LABELS = { prev: "← 前日", next: "翌日 →", backToToday: "今日へ" };

function ScanBody() {
  const cohort = useActiveCohort();

  // 画面を開いた時点の日付を今日として固定する。日付をまたいで開きっぱなしに
  // することは想定しない（朝の数分で使い切る画面のため）。日付送りで見ている
  // date はこれとは別に動く。
  const [today] = useState(() => toDateKey(new Date()));
  const [date, setDate] = useState(today);

  const students = useStudents(cohort.id);
  const types = useSubmissionTypes(cohort.id);
  const submissions = useSubmissions(cohort.id, date);

  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  const [result, setResult] = useState<RecordResult | null>(null);
  const [mode, setMode] = useState<"camera" | "number">("camera");

  // handleScan は selected を参照するが、それが決まるのは早期returnの後。
  // フックは早期returnより前に置く必要があるため、refで後から差し込む。
  const scanHandlerRef = useRef<(payload: string) => void>(() => {});
  const camera = useQrCamera({
    enabled: mode === "camera",
    onScan: (payload) => scanHandlerRef.current(payload),
  });

  // カメラが使えないと分かったら番号モードへ落とす。
  // 黙って何も映らないと、先生は端末の故障と考える。
  useEffect(() => {
    if (camera.state === "unavailable" || camera.state === "denied") {
      setMode("number");
    }
  }, [camera.state]);

  // 提出記録の再読み込みでは全画面の読み込み表示に戻さない。
  // 記録するたびに画面が差し替わると、出したばかりの花丸と結果が
  // 一瞬で消えてしまい、先生が読めたかどうか分からなくなる。
  if (students.status === "loading" || types.status === "loading") {
    return <FullScreenMessage>読み込んでいます</FullScreenMessage>;
  }
  if (students.status === "error") {
    return <FullScreenMessage tone="error">{students.message}</FullScreenMessage>;
  }
  if (types.status === "error") {
    return <FullScreenMessage tone="error">{types.message}</FullScreenMessage>;
  }
  if (submissions.status === "error") {
    return (
      <FullScreenMessage tone="error">{submissions.message}</FullScreenMessage>
    );
  }

  // 再読み込み中は前回の一覧が無いので空として扱う。進捗の人数が
  // 一瞬0に見えるだけで、記録そのものには影響しない。
  const recorded =
    submissions.status === "ready" ? submissions.data : [];

  const activeTypes = types.data.filter((type) => type.status === "active");
  const todayTypes = activeTypes.filter((type) => isDueOn(type, date));

  // 初期状態は全部ON。毎朝すべてを確認するのが通常で、
  // 先生が毎回選び直す手間を省く。
  const selected = selectedIds ?? todayTypes.map((type) => type.id);

  const activeStudents = students.data.filter(
    (student) => student.status === "active",
  );

  const doneIds = activeStudents
    .filter((student) =>
      selected.every((typeId) =>
        recorded.some(
          (submission) =>
            submission.studentId === student.id &&
            submission.submissionTypeId === typeId,
        ),
      ),
    )
    .map((student) => student.id);

  const isToday = date === today;

  // 日付を送ったら選択と直前の結果を捨てる。持ち越すと、その日に
  // 提出日が来ていない項目が選択されたまま記録されてしまう。
  function changeDate(next: string): void {
    setDate(next);
    setSelectedIds(null);
    setResult(null);
  }

  function toggle(id: string): void {
    setSelectedIds(
      selected.includes(id)
        ? selected.filter((current) => current !== id)
        : [...selected, id],
    );
  }

  function pick(studentId: string): void {
    void recordSubmission({
      cohortId: cohort.id,
      studentId,
      submissionTypeIds: selected,
      date,
    }).then((next) => {
      setResult(next);
      submissions.reload();
    });
  }

  // 「提出済み」を出した直後だけ取り消せる。提出済みの番号をもう一度タップ
  // →「取り消す」が出る、という二段階にして、連続タップの事故で記録が
  // 消えないようにする。
  function withdraw(): void {
    if (result === null || result.kind !== "already") {
      return;
    }
    const student = result.student;
    void withdrawSubmission({
      studentId: student.id,
      submissionTypeIds: selected,
      date,
    }).then(() => {
      setResult({ kind: "withdrawn", student });
      submissions.reload();
    });
  }

  function handleScan(payload: string): void {
    if (selected.length === 0) {
      return;
    }

    const studentId = parseQrPayload(payload);
    if (studentId === null) {
      // このアプリのQRでなければ黙って無視する。教室で商品バーコードが
      // カメラに入っても先生の手を止めない。
      return;
    }
    pick(studentId);
  }

  scanHandlerRef.current = handleScan;

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 p-4">
      <header
        className={
          isToday
            ? "border-kogan flex items-center justify-between gap-3 border-b pb-3"
            : "bg-ai flex items-center justify-between gap-3 rounded p-3"
        }
      >
        <h1
          className={
            isToday
              ? "font-display text-ai text-2xl"
              : "font-display text-gayoshi text-2xl"
          }
        >
          {formatDateHeading(dateFromKey(date))}
        </h1>
        <Link
          to="/roster"
          className={
            isToday
              ? "text-ai shrink-0 p-2 font-bold underline"
              : "text-gayoshi shrink-0 p-2 font-bold underline"
          }
        >
          名簿へ
        </Link>
      </header>

      <DateStepper
        date={date}
        today={today}
        onChange={changeDate}
        labels={DATE_LABELS}
      />

      {activeTypes.length === 0 ? (
        <div className="py-12 text-center">
          <p>まず提出物を登録してください</p>
          <Link
            to="/submissions"
            className="bg-ai mt-4 inline-block rounded px-4 py-3 font-bold text-gayoshi"
          >
            提出物の設定
          </Link>
        </div>
      ) : todayTypes.length === 0 ? (
        <p className="py-12 text-center">この日が提出日の宿題はありません</p>
      ) : (
        <>
          <SubmissionToggleBar
            types={todayTypes}
            selectedIds={selected}
            onToggle={toggle}
          />

          <ScanResult
            result={result}
            dateLabel={
              isToday ? undefined : formatDateHeading(dateFromKey(date))
            }
            onWithdraw={withdraw}
          />

          {mode === "camera" ? (
            <CameraView
              state={camera.state}
              message={camera.message}
              videoRef={camera.videoRef}
              canvasRef={camera.canvasRef}
              onStart={camera.start}
            />
          ) : selected.length === 0 ? (
            <p className="py-8 text-center font-bold">
              チェックする提出物を選んでください
            </p>
          ) : (
            <NumberPad
              students={activeStudents}
              doneIds={doneIds}
              onPick={pick}
            />
          )}

          <button
            type="button"
            onClick={() => setMode(mode === "camera" ? "number" : "camera")}
            className="border-ai text-ai min-h-11 rounded border-2 px-4 py-2 font-bold"
          >
            {mode === "camera" ? "番号でチェック" : "カメラでスキャン"}
          </button>

          <p className="mt-auto pt-4 text-sm">
            {todayTypes
              .map((type) => {
                const count = recorded.filter(
                  (submission) => submission.submissionTypeId === type.id,
                ).length;
                return `${type.name} ${count}/${activeStudents.length}人`;
              })
              .join("・")}
          </p>
        </>
      )}
    </main>
  );
}

export function Scan() {
  return (
    <CohortGate>
      <ScanBody />
    </CohortGate>
  );
}
