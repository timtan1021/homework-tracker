import { deleteDB } from "idb";
import { beforeEach } from "vitest";
import { DB_NAME, resetDbForTests } from "../db/schema";

/** 各テストの前にDBを完全に作り直す。 */
export function useFreshDb(): void {
  beforeEach(async () => {
    await resetDbForTests();
    await deleteDB(DB_NAME);
  });
}
