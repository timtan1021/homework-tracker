import { useRef, useState } from "react";
import { Link } from "react-router";
import { CameraView } from "../components/CameraView";
import { CohortGate, useActiveCohort } from "../components/CohortGate";
import { DateStepper } from "../components/DateStepper";
import { FullScreenMessage } from "../components/FullScreenMessage";
import { ScanResult } from "../components/ScanResult";
import { SubmissionToggleBar } from "../components/SubmissionToggleBar";
import { recordSubmission, type RecordResult } from "../db/submissions";
import { isDueOn } from "../db/submissionTypes";
import { useQrCamera } from "../hooks/useQrCamera";
import { useSubmissionTypes } from "../hooks/useSubmissionTypes";
import {
  addDays,
  dateFromKey,
  formatDateHeading,
  toDateKey,
} from "../lib/date";
import { parseQrPayload } from "../lib/qr";

const DATE_LABELS = {
  prev: "← まえのひ",
  next: "あしたのぶん →",
  backToToday: "← きょうにもどる",
};

/**
 * 子供が自分でQRをかざす画面。
 *
 * 教員用スキャン（Scan.tsx）との違いは6点。どれも「子供が触る」ことから来る。
 * 1. 提出物の初期選択が空（教員用は今日の分すべて）。何も考えずかざした子が
 *    出していない宿題まで提出済みになるのを防ぐ
 * 2. 記録したら選択を空に戻す。前の子の選択が次の子に引き継がれない
 * 3. 選び始めたら前の結果を消す。誰の花丸か分からなくならないように
 * 4. 番号パッドを出さない。他人の番号を押せてしまう
 * 5. クラス全体の進捗を出さない。それは教員の情報
 * 6. 日付は今日と翌日しか見られない。過去の未提出を自分で埋められない
 *    ようにする（過去分の補正は教員のスキャン画面だけに残す）
 *
 * 生徒一覧を読まないのは、番号パッドが無く、生徒の存在確認は
 * recordSubmission が行うため（notFound / transferredOut を返す）。
 */
function KidsScanBody() {
  const cohort = useActiveCohort();

  // 画面を開いた時点の日付を今日として固定する（Scan.tsx と同じ理由）。
  const [today] = useState(() => toDateKey(new Date()));
  const [date, setDate] = useState(today);
  const tomorrow = addDays(today, 1);

  const types = useSubmissionTypes(cohort.id);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [result, setResult] = useState<RecordResult | null>(null);

  // handleScan は selectedIds を参照するが、フックは早期returnより前に
  // 置く必要がある。refで後から差し込む（Scan.tsx と同じ形）。
  const scanHandlerRef = useRef<(payload: string) => void>(() => {});
  const camera = useQrCamera({
    enabled: true,
    onScan: (payload) => scanHandlerRef.current(payload),
  });

  if (types.status === "loading") {
    return <FullScreenMessage>よみこんでいます</FullScreenMessage>;
  }
  if (types.status === "error") {
    // 子供に打つ手が無いので戻る導線を出さない（既定の戻り先は
    // /roster で、それ自身が教員ルート）。
    return (
      <FullScreenMessage tone="error" showBackLink={false}>
        せんせいを よんでください
      </FullScreenMessage>
    );
  }

  const isToday = date === today;

  const todayTypes = types.data
    .filter((type) => type.status === "active")
    .filter((type) => isDueOn(type, date));

  // 日付を送ったら選択と前の結果を捨てる（Scan.tsx と同じ理由）。
  function changeDate(next: string): void {
    setDate(next);
    setSelectedIds([]);
    setResult(null);
  }

  function toggle(id: string): void {
    // 次の子が選び始めたら、前の子の花丸と番号を消す
    setResult(null);
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selected) => selected !== id)
        : [...current, id],
    );
  }

  function handleScan(payload: string): void {
    if (selectedIds.length === 0) {
      return;
    }

    const studentId = parseQrPayload(payload);
    if (studentId === null) {
      // このアプリのQRでなければ黙って無視する。教室で商品バーコードが
      // カメラに入っても止まらない。
      return;
    }

    void recordSubmission({
      cohortId: cohort.id,
      studentId,
      submissionTypeIds: selectedIds,
      date,
    }).then((next) => {
      setResult(next);
      // 次の子のために選び直させる
      setSelectedIds([]);
    });
  }

  scanHandlerRef.current = handleScan;

  const cameraUsable = camera.state === "running" || camera.state === "starting";

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
        {/* 先生の入口。目立たせないが、44px四方のタップ領域は確保する */}
        <Link
          to="/roster"
          className={
            isToday
              ? "text-sumi flex size-11 shrink-0 items-center justify-center text-sm"
              : "text-gayoshi flex size-11 shrink-0 items-center justify-center text-sm"
          }
        >
          せんせい
        </Link>
      </header>

      <DateStepper
        date={date}
        today={today}
        onChange={changeDate}
        labels={DATE_LABELS}
        min={today}
        max={tomorrow}
      />

      {todayTypes.length === 0 ? (
        <p className="py-12 text-center text-xl">
          {isToday
            ? "きょうは だすものが ありません"
            : "あしたは だすものが ありません"}
        </p>
      ) : (
        <>
          <SubmissionToggleBar
            types={todayTypes}
            selectedIds={selectedIds}
            onToggle={toggle}
          />

          <ScanResult result={result} />

          {!cameraUsable ? (
            // useQrCamera の文言は「番号でチェックしてください」と促すが、
            // この画面に番号パッドは無い。子供に打つ手が無い指示を出さない。
            <p className="py-8 text-center text-xl font-bold">
              せんせいを よんでください
            </p>
          ) : (
            <>
              {selectedIds.length === 0 && (
                <p className="py-4 text-center text-xl font-bold">
                  だしたものを えらんでね
                </p>
              )}
              <CameraView
                state={camera.state}
                message={camera.message}
                videoRef={camera.videoRef}
                canvasRef={camera.canvasRef}
              />
            </>
          )}
        </>
      )}
    </main>
  );
}

export function KidsScan() {
  return (
    <CohortGate>
      <KidsScanBody />
    </CohortGate>
  );
}
