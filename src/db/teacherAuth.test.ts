import { describe, expect, it } from "vitest";
import { useFreshDb } from "../test/db";
import { ValidationError } from "./errors";
import { getDb } from "./schema";
import {
  isTeacherPasswordSet,
  resetTeacherPassword,
  setTeacherPassword,
  verifyTeacherPassword,
} from "./teacherAuth";

useFreshDb();

describe("isTeacherPasswordSet", () => {
  it("未設定なら false", async () => {
    expect(await isTeacherPasswordSet()).toBe(false);
  });

  it("設定すると true", async () => {
    await setTeacherPassword("あさのかい");
    expect(await isTeacherPasswordSet()).toBe(true);
  });

  it("レコードが壊れていたら未設定として扱う", async () => {
    // 開けなくなるより、設定し直せるほうがよい
    const db = await getDb();
    await db.put("settings", { key: "teacherAuth", value: { salt: 1 } });
    expect(await isTeacherPasswordSet()).toBe(false);
  });
});

describe("verifyTeacherPassword", () => {
  it("設定したパスワードで通る", async () => {
    await setTeacherPassword("あさのかい");
    expect(await verifyTeacherPassword("あさのかい")).toBe(true);
  });

  it("違うパスワードでは通らない", async () => {
    await setTeacherPassword("あさのかい");
    expect(await verifyTeacherPassword("あさのかー")).toBe(false);
  });

  it("未設定なら通らない", async () => {
    expect(await verifyTeacherPassword("あさのかい")).toBe(false);
  });
});

describe("setTeacherPassword", () => {
  it("平文をどこにも保存しない", async () => {
    await setTeacherPassword("あさのかい");
    const db = await getDb();
    const row = await db.get("settings", "teacherAuth");
    expect(JSON.stringify(row)).not.toContain("あさのかい");
  });

  it("同じパスワードでも保存されるハッシュが毎回変わる", async () => {
    // saltが固定だと、2つの端末のハッシュを見比べて同じパスワードだと分かる
    await setTeacherPassword("あさのかい");
    const db = await getDb();
    const first = await db.get("settings", "teacherAuth");

    await setTeacherPassword("あさのかい");
    const second = await db.get("settings", "teacherAuth");

    expect(JSON.stringify(first)).not.toBe(JSON.stringify(second));
  });

  it("4文字未満は拒否する", async () => {
    await expect(setTeacherPassword("abc")).rejects.toThrow(
      new ValidationError("パスワードは4文字以上にしてください"),
    );
  });

  it("拒否したときは何も保存しない", async () => {
    await expect(setTeacherPassword("abc")).rejects.toThrow(ValidationError);
    expect(await isTeacherPasswordSet()).toBe(false);
  });

  it("4文字ちょうどは受け付ける", async () => {
    await setTeacherPassword("abcd");
    expect(await verifyTeacherPassword("abcd")).toBe(true);
  });
});

describe("resetTeacherPassword", () => {
  it("合言葉が合えば新しいパスワードで通るようになる", async () => {
    const phrase = await setTeacherPassword("あさのかい");
    await resetTeacherPassword(phrase, "あたらしい");
    expect(await verifyTeacherPassword("あたらしい")).toBe(true);
  });

  it("再設定すると古いパスワードでは通らなくなる", async () => {
    const phrase = await setTeacherPassword("あさのかい");
    await resetTeacherPassword(phrase, "あたらしい");
    expect(await verifyTeacherPassword("あさのかい")).toBe(false);
  });

  it("ハイフンを省いた合言葉でも通る", async () => {
    const phrase = await setTeacherPassword("あさのかい");
    await resetTeacherPassword(phrase.replaceAll("-", ""), "あたらしい");
    expect(await verifyTeacherPassword("あたらしい")).toBe(true);
  });

  it("空白区切りの合言葉でも通る", async () => {
    const phrase = await setTeacherPassword("あさのかい");
    await resetTeacherPassword(phrase.replaceAll("-", " "), "あたらしい");
    expect(await verifyTeacherPassword("あたらしい")).toBe(true);
  });

  it("違う合言葉は拒否する", async () => {
    await setTeacherPassword("あさのかい");
    await expect(
      resetTeacherPassword("あめ-そら-ほし-つき", "あたらしい"),
    ).rejects.toThrow(
      new ValidationError("合言葉が違います。控えた紙のとおりに入力してください"),
    );
  });

  it("違う合言葉のときはパスワードを変えない", async () => {
    await setTeacherPassword("あさのかい");
    await expect(
      resetTeacherPassword("あめ-そら-ほし-つき", "あたらしい"),
    ).rejects.toThrow(ValidationError);
    expect(await verifyTeacherPassword("あさのかい")).toBe(true);
  });

  it("新しい合言葉を返し、古い合言葉は使えなくなる", async () => {
    const first = await setTeacherPassword("あさのかい");
    const second = await resetTeacherPassword(first, "あたらしい");

    await expect(resetTeacherPassword(first, "みっつめ")).rejects.toThrow(
      ValidationError,
    );
    await resetTeacherPassword(second, "みっつめ");
    expect(await verifyTeacherPassword("みっつめ")).toBe(true);
  });

  it("新しいパスワードが4文字未満なら拒否し、古いままにする", async () => {
    const phrase = await setTeacherPassword("あさのかい");
    await expect(resetTeacherPassword(phrase, "abc")).rejects.toThrow(
      new ValidationError("パスワードは4文字以上にしてください"),
    );
    expect(await verifyTeacherPassword("あさのかい")).toBe(true);
  });

  it("未設定なら拒否する", async () => {
    await expect(
      resetTeacherPassword("あめ-そら-ほし-つき", "あたらしい"),
    ).rejects.toThrow(ValidationError);
  });
});
