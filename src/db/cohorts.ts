import { newId } from "../lib/id";
import { ValidationError } from "./errors";
import { getDb, type Cohort } from "./schema";

export async function createCohort(input: {
  year: number;
  className: string;
}): Promise<Cohort> {
  const className = input.className.trim();
  if (className === "") {
    throw new ValidationError("クラス名を入力してください");
  }

  const cohort: Cohort = {
    id: newId(),
    year: input.year,
    className,
    isActive: true,
    createdAt: Date.now(),
  };

  const db = await getDb();
  const tx = db.transaction("cohorts", "readwrite");

  // 有効なcohortは常に1件だけ。
  // トランザクションが閉じないよう、書き込みはまとめて発行する。
  const existing = await tx.store.getAll();
  await Promise.all(
    existing
      .filter((current) => current.isActive)
      .map((current) => tx.store.put({ ...current, isActive: false })),
  );
  await tx.store.put(cohort);
  await tx.done;

  return cohort;
}

export async function getActiveCohort(): Promise<Cohort | null> {
  const db = await getDb();
  const all = await db.getAll("cohorts");
  return all.find((cohort) => cohort.isActive) ?? null;
}
