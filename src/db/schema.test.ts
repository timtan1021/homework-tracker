import { afterEach, describe, expect, it, vi } from "vitest";
import { useFreshDb } from "../test/db";
import { StorageUnavailableError } from "./errors";
import { getDb } from "./schema";

useFreshDb();

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getDb", () => {
  it("IndexedDBが使えなければ復旧方法を示して失敗する", async () => {
    vi.stubGlobal("indexedDB", undefined);

    await expect(getDb()).rejects.toThrow(StorageUnavailableError);
    await expect(getDb()).rejects.toThrow(
      "この端末ではデータを保存できません。プライベートブラウズを解除して開き直してください",
    );
  });

  it("使えるときは同じ接続を返す", async () => {
    expect(await getDb()).toBe(await getDb());
  });
});
