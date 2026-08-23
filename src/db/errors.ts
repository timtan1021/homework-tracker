/** 入力値が不正なときに投げる。message はそのまま画面に出せる日本語であること。 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** IndexedDB が使えないときに投げる。 */
export class StorageUnavailableError extends Error {
  constructor() {
    super(
      "この端末ではデータを保存できません。プライベートブラウズを解除して開き直してください",
    );
    this.name = "StorageUnavailableError";
  }
}
