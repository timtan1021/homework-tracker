import { useEffect, useState } from "react";
import type { Student } from "../db/schema";
import { buildQrPayload, renderQrSvg } from "../lib/qr";

type QrState =
  | { status: "loading" }
  | { status: "ready"; svg: string }
  | { status: "failed" };

export function QrCard({
  student,
  showName,
}: {
  student: Student;
  showName: boolean;
}) {
  const [qr, setQr] = useState<QrState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setQr({ status: "loading" });

    renderQrSvg(buildQrPayload(student.id))
      .then((svg) => {
        if (!cancelled) {
          setQr({ status: "ready", svg });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQr({ status: "failed" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [student.id]);

  return (
    <div
      data-testid="qr-card"
      className="qr-card flex flex-col items-center justify-center gap-1 bg-white"
    >
      {qr.status === "ready" ? (
        // 自前で生成したQRのSVGのみを入れる
        <div dangerouslySetInnerHTML={{ __html: qr.svg }} />
      ) : qr.status === "failed" ? (
        <p className="px-2 text-center text-[9pt]">QRを生成できませんでした</p>
      ) : (
        <div style={{ width: "38mm", height: "38mm" }} />
      )}

      <span className="font-num text-[20pt] leading-none font-bold">
        {student.attendanceNumber}
      </span>

      {showName && student.name !== "" && (
        <span className="max-w-full truncate px-1 text-[9pt]">{student.name}</span>
      )}
    </div>
  );
}
