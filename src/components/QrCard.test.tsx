import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Student } from "../db/schema";
import { QrCard } from "./QrCard";

vi.mock("../lib/qr", () => ({
  QR_PAYLOAD_PREFIX: "hw1:",
  buildQrPayload: (studentId: string) => `hw1:${studentId}`,
  renderQrSvg: vi.fn().mockRejectedValue(new Error("生成に失敗しました")),
}));

const student: Student = {
  id: "9f2c1a84-4d3e-4c1b-8f77-2b6c9a0e51d3",
  cohortId: "cohort-1",
  attendanceNumber: 7,
  name: "やまだ",
  status: "active",
  createdAt: 0,
};

describe("QrCard", () => {
  it("QRを作れなくても出席番号は残す", async () => {
    render(<QrCard student={student} showName={false} />);

    expect(
      await screen.findByText("QRを生成できませんでした"),
    ).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });
});
