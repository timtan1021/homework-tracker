import type { ReactNode } from "react";

export function FullScreenMessage({
  children,
  tone = "normal",
}: {
  children: ReactNode;
  tone?: "normal" | "error";
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className="flex min-h-dvh items-center justify-center p-6"
    >
      <p
        className={`max-w-sm text-center ${
          tone === "error" ? "text-sumi font-bold" : "text-ai"
        }`}
      >
        {children}
      </p>
    </div>
  );
}
