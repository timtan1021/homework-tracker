import type { RefObject } from "react";
import type { CameraState } from "../hooks/useQrCamera";

export function CameraView({
  state,
  message,
  videoRef,
  canvasRef,
}: {
  state: CameraState;
  message: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
}) {
  if (state === "unavailable" || state === "denied") {
    return (
      <p role="alert" className="py-8 text-center font-bold">
        {message}
      </p>
    );
  }

  return (
    <div className="mx-auto w-full max-w-80">
      <video
        ref={videoRef}
        playsInline
        muted
        className="border-ai aspect-square w-full rounded border-2 object-cover"
      />
      {/* フレーム取り出し用。画面には出さない。 */}
      <canvas ref={canvasRef} className="hidden" />
      {state === "starting" && (
        <p className="mt-2 text-center text-sm">カメラを準備しています</p>
      )}
    </div>
  );
}
