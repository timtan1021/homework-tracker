import QRCode from "qrcode";

/** スキャナが無関係なQRコードを弾くための接頭辞。1 はペイロード形式のバージョン。 */
export const QR_PAYLOAD_PREFIX = "hw1:";

/** QRに埋め込む文字列。出席番号ではなく不変の内部IDを使う。 */
export function buildQrPayload(studentId: string): string {
  return `${QR_PAYLOAD_PREFIX}${studentId}`;
}

/**
 * QRから読んだ文字列を内部IDに戻す。このアプリのQRでなければ null。
 *
 * 接頭辞で弾くのは、教室で商品バーコードや他アプリのQRが
 * カメラに入っても黙って無視するため。
 */
export function parseQrPayload(payload: string): string | null {
  if (!payload.startsWith(QR_PAYLOAD_PREFIX)) {
    return null;
  }

  const studentId = payload.slice(QR_PAYLOAD_PREFIX.length);
  return studentId === "" ? null : studentId;
}

export function renderQrSvg(payload: string): Promise<string> {
  return QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: "Q",
    margin: 4,
  });
}
