import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFreshDb } from "../test/db";
import { createCohort } from "../db/cohorts";
import { addStudent } from "../db/students";
import { addSubmissionType } from "../db/submissionTypes";
import { listSubmissions } from "../db/submissions";
import { toDateKey } from "../lib/date";
import { buildQrPayload } from "../lib/qr";
import { KidsScan } from "./KidsScan";

// useQrCamera は getUserMedia と requestAnimationFrame と canvas と jsQR を
// 使うため jsdom では動かない。onScan を掴んで、外からスキャンを起こす。
// vi.mock はホイストされるので、掴む先は vi.hoisted で先に作る。
const camera = vi.hoisted(() => ({
  onScan: null as ((payload: string) => void) | null,
  state: "running" as "running" | "starting" | "unavailable" | "denied",
  message: null as string | null,
}));

vi.mock("../hooks/useQrCamera", () => ({
  useQrCamera: ({ onScan }: { onScan: (payload: string) => void }) => {
    camera.onScan = onScan;
    return {
      state: camera.state,
      message: camera.message,
      videoRef: { current: null },
      canvasRef: { current: null },
    };
  },
  cameraUnavailableReason: () => null,
}));

useFreshDb();

const TODAY = new Date();
const TODAY_KEY = toDateKey(TODAY);
const TODAY_WEEKDAY = TODAY.getDay();

let cohortId = "";

beforeEach(async () => {
  camera.state = "running";
  camera.message = null;
  camera.onScan = null;

  const cohort = await createCohort({ year: 2026, className: "5年1組" });
  cohortId = cohort.id;
});

function addType(name: string, weekdays = [TODAY_WEEKDAY]) {
  return addSubmissionType({ cohortId, name, deadline: "08:15", weekdays });
}

function renderKids() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <KidsScan />
    </MemoryRouter>,
  );
}

/** QRカードをかざしたことにする。 */
async function scanCard(studentId: string) {
  await act(async () => {
    camera.onScan?.(buildQrPayload(studentId));
  });
}

function addKid(attendanceNumber: number) {
  return addStudent({ cohortId, attendanceNumber, name: "" });
}

describe("提出物の選択", () => {
  it("最初は何も選ばれていない", async () => {
    await addType("かんじドリル");
    renderKids();

    expect(
      await screen.findByRole("button", { name: /かんじドリル/ }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("選んでいないうちは選ぶよう促す", async () => {
    await addType("かんじドリル");
    renderKids();

    expect(
      await screen.findByText("だしたものを えらんでね"),
    ).toBeInTheDocument();
  });

  it("タップすると選べる", async () => {
    const user = userEvent.setup();
    await addType("かんじドリル");
    renderKids();

    await user.click(
      await screen.findByRole("button", { name: /かんじドリル/ }),
    );

    // 再描画で要素が差し替わるため、掴んだ参照を使い回さず毎回引き直す
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /かんじドリル/ }),
      ).toHaveAttribute("aria-pressed", "true");
    });
  });
});

describe("スキャン", () => {
  it("何も選んでいなければ記録しない", async () => {
    const student = await addKid(1);
    await addType("かんじドリル");
    renderKids();

    await screen.findByText("だしたものを えらんでね");
    await scanCard(student.id);

    expect(await listSubmissions(cohortId, TODAY_KEY)).toHaveLength(0);
  });

  it("選んでからかざすと記録する", async () => {
    const user = userEvent.setup();
    const student = await addKid(1);
    await addType("かんじドリル");
    renderKids();

    await user.click(
      await screen.findByRole("button", { name: /かんじドリル/ }),
    );
    await scanCard(student.id);

    await waitFor(async () => {
      expect(await listSubmissions(cohortId, TODAY_KEY)).toHaveLength(1);
    });
  });

  it("選んだものだけ記録する", async () => {
    // 今日の提出物が2つあり、片方だけ出した子。もう片方は未提出のまま。
    const user = userEvent.setup();
    const student = await addKid(1);
    const kanji = await addType("かんじドリル");
    await addType("さんすうプリント");
    renderKids();

    await user.click(
      await screen.findByRole("button", { name: /かんじドリル/ }),
    );
    await scanCard(student.id);

    await waitFor(async () => {
      const recorded = await listSubmissions(cohortId, TODAY_KEY);
      expect(recorded).toHaveLength(1);
      expect(recorded[0].submissionTypeId).toBe(kanji.id);
    });
  });

  it("花丸と番号を出す", async () => {
    const user = userEvent.setup();
    const student = await addKid(7);
    await addType("かんじドリル");
    renderKids();

    await user.click(
      await screen.findByRole("button", { name: /かんじドリル/ }),
    );
    await scanCard(student.id);

    expect(await screen.findByText("7番")).toBeInTheDocument();
  });

  it("記録したあと選択が空に戻る", async () => {
    // 前の子の選択が次の子に引き継がれないこと
    const user = userEvent.setup();
    const student = await addKid(1);
    await addType("かんじドリル");
    renderKids();

    await user.click(
      await screen.findByRole("button", { name: /かんじドリル/ }),
    );
    await scanCard(student.id);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /かんじドリル/ }),
      ).toHaveAttribute("aria-pressed", "false");
    });
  });

  it("次の子が選び始めると前の結果が消える", async () => {
    const user = userEvent.setup();
    const student = await addKid(1);
    await addType("かんじドリル");
    renderKids();

    await user.click(
      await screen.findByRole("button", { name: /かんじドリル/ }),
    );
    await scanCard(student.id);
    await screen.findByText("1番");

    await user.click(screen.getByRole("button", { name: /かんじドリル/ }));

    await waitFor(() => {
      expect(screen.queryByText("1番")).not.toBeInTheDocument();
    });
  });

  it("このアプリのQRでなければ黙って無視する", async () => {
    const user = userEvent.setup();
    await addKid(1);
    await addType("かんじドリル");
    renderKids();

    await user.click(
      await screen.findByRole("button", { name: /かんじドリル/ }),
    );
    await act(async () => {
      camera.onScan?.("4901234567894");
    });

    expect(await listSubmissions(cohortId, TODAY_KEY)).toHaveLength(0);
    expect(
      screen.queryByText("このクラスの生徒ではありません"),
    ).not.toBeInTheDocument();
  });
});

describe("子供に見せないもの", () => {
  beforeEach(async () => {
    await addType("かんじドリル");
  });

  it("名簿へのリンクを出さない", async () => {
    renderKids();
    await screen.findByRole("button", { name: /かんじドリル/ });

    expect(
      screen.queryByRole("link", { name: "名簿へ" }),
    ).not.toBeInTheDocument();
  });

  it("番号でチェックへ切り替えられない", async () => {
    renderKids();
    await screen.findByRole("button", { name: /かんじドリル/ });

    expect(
      screen.queryByRole("button", { name: "番号でチェック" }),
    ).not.toBeInTheDocument();
  });

  it("クラス全体の進捗を出さない", async () => {
    renderKids();
    await screen.findByRole("button", { name: /かんじドリル/ });

    expect(screen.queryByText(/かんじドリル \d+人/)).not.toBeInTheDocument();
  });

  it("先生への入口はある", async () => {
    renderKids();

    expect(await screen.findByRole("link", { name: "せんせい" })).toHaveAttribute(
      "href",
      "/roster",
    );
  });
});

describe("出せるものが無いとき", () => {
  it("提出物が未登録なら設定へ誘わない", async () => {
    renderKids();

    expect(
      await screen.findByText("きょうは だすものが ありません"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "提出物の設定" }),
    ).not.toBeInTheDocument();
  });

  it("今日が提出日でなければ同じことを伝える", async () => {
    await addType("かんじドリル", [(TODAY_WEEKDAY + 1) % 7]);
    renderKids();

    expect(
      await screen.findByText("きょうは だすものが ありません"),
    ).toBeInTheDocument();
  });
});

describe("カメラが使えないとき", () => {
  it("番号でチェックとは言わず、先生を呼ばせる", async () => {
    // useQrCamera の文言は「番号でチェックしてください」と促すが、
    // 児童画面に番号パッドは無い。子供に打つ手が無い指示を出さない。
    camera.state = "denied";
    camera.message =
      "カメラを使えません。端末の設定で許可するか、番号でチェックしてください";

    const user = userEvent.setup();
    await addType("かんじドリル");
    renderKids();

    await user.click(
      await screen.findByRole("button", { name: /かんじドリル/ }),
    );

    expect(
      await screen.findByText("せんせいを よんでください"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/番号でチェック/)).not.toBeInTheDocument();
  });
});
