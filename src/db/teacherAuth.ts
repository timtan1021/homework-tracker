import { generatePassphrase, normalizePassphrase } from "../lib/passphrase";
import { ValidationError } from "./errors";
import { getDb } from "./schema";

const TEACHER_AUTH_KEY = "teacherAuth";
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const DERIVED_BITS = 256;

export const MIN_PASSWORD_LENGTH = 4;

/**
 * 教員パスワードの検証material。平文は保存しない。
 *
 * この鍵が守るのは「小学生が興味本位で名簿を開くこと」であり、
 * DevToolsを開ける相手ではない。IndexedDBは読めるし、このレコードを
 * 消せば「未設定」に戻る。端末内で完結するオフラインアプリの構造上、
 * それ以上は守れない。
 */
type TeacherAuth = {
  salt: string;
  hash: string;
  /** 将来反復回数を上げられるようレコードに持たせる */
  iterations: number;
  recoverySalt: string;
  recoveryHash: string;
};

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
}

function randomSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES)) as Uint8Array<ArrayBuffer>;
}

async function derive(
  secret: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    DERIVED_BITS,
  );
  return toBase64(new Uint8Array(bits));
}

function isTeacherAuth(value: unknown): value is TeacherAuth {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.salt === "string" &&
    typeof row.hash === "string" &&
    typeof row.iterations === "number" &&
    typeof row.recoverySalt === "string" &&
    typeof row.recoveryHash === "string"
  );
}

async function readAuth(): Promise<TeacherAuth | null> {
  const db = await getDb();
  const row = await db.get("settings", TEACHER_AUTH_KEY);
  return isTeacherAuth(row?.value) ? row.value : null;
}

/**
 * 検証は単純な文字列比較で行う。定数時間比較は入れない。
 * ハッシュそのものをDevToolsで読める環境で、タイミング差を測る意味がない。
 */
async function matches(
  secret: string,
  salt: string,
  hash: string,
  iterations: number,
): Promise<boolean> {
  return (await derive(secret, fromBase64(salt), iterations)) === hash;
}

async function write(password: string): Promise<string> {
  const passphrase = generatePassphrase();
  const salt = randomSalt();
  const recoverySalt = randomSalt();

  const value: TeacherAuth = {
    salt: toBase64(salt),
    hash: await derive(password, salt, ITERATIONS),
    iterations: ITERATIONS,
    recoverySalt: toBase64(recoverySalt),
    recoveryHash: await derive(
      normalizePassphrase(passphrase),
      recoverySalt,
      ITERATIONS,
    ),
  };

  const db = await getDb();
  await db.put("settings", { key: TEACHER_AUTH_KEY, value });
  return passphrase;
}

export async function isTeacherPasswordSet(): Promise<boolean> {
  return (await readAuth()) !== null;
}

/** 設定して合言葉を返す。返した合言葉は保存されない（ハッシュのみ保存する）。 */
export async function setTeacherPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError("パスワードは4文字以上にしてください");
  }
  return write(password);
}

export async function verifyTeacherPassword(
  password: string,
): Promise<boolean> {
  const auth = await readAuth();
  if (auth === null) {
    return false;
  }
  return matches(password, auth.salt, auth.hash, auth.iterations);
}

/**
 * 合言葉が合えば新しいパスワードを設定し、新しい合言葉を返す。
 * 合言葉も作り直す。古い合言葉を紙で持ったままにしない。
 */
export async function resetTeacherPassword(
  phrase: string,
  nextPassword: string,
): Promise<string> {
  const auth = await readAuth();
  if (auth === null) {
    throw new ValidationError(
      "パスワードがまだ設定されていません。画面を開き直してください",
    );
  }

  const ok = await matches(
    normalizePassphrase(phrase),
    auth.recoverySalt,
    auth.recoveryHash,
    auth.iterations,
  );
  if (!ok) {
    throw new ValidationError(
      "合言葉が違います。控えた紙のとおりに入力してください",
    );
  }

  if (nextPassword.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError("パスワードは4文字以上にしてください");
  }

  return write(nextPassword);
}
