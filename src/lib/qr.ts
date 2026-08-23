import QRCode from "qrcode";

/** スキャナが無関係なQRコードを弾くための接頭辞。1 はペイロード形式のバージョン。 */
export const QR_PAYLOAD_PREFIX = "hw1:";

/** QRに埋め込む文字列。出席番号ではなく不変の内部IDを使う。 */
export function buildQrPayload(studentId: string): string {
  return `${QR_PAYLOAD_PREFIX}${studentId}`;
}

export function renderQrSvg(payload: string): Promise<string> {
  return QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: "Q",
    margin: 4,
  });
}
