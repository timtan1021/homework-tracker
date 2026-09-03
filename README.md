# 宿題提出管理アプリ

小学校の担任が朝の会の前に宿題の提出をチェックするためのPWA。オフラインで動作し、データは端末内のIndexedDBに閉じる（サーバーには送信されない）。

デモ: https://genuine-syrniki-f24184.netlify.app

設計判断の背景は [CLAUDE.md](./CLAUDE.md) を参照。

## セットアップ

```
npm install
npm run dev      # localhost:5173 で起動
```

## コマンド

```
npm run test:run   # テスト単発実行
npm run build      # 型チェック + ビルド（tsc --noEmit && vite build）
npm run preview    # ビルド結果をローカルで確認
```

QRコード読み取り機能（カメラ）はブラウザのセキュアコンテキスト制約により、`localhost` またはHTTPS配信でのみ動作する。番号入力での代替手段も常設している。

## 自分のクラス用に使う

このアプリは1台の端末＝1クラス分のデータという設計。上記デモURLをそのまま開いて生徒名簿を登録すれば、他の人のデータと混ざることなく使える。自分でデプロイし直す場合はNetlifyなど静的ホスティングに `npm run build` の出力（`dist/`）を配置すればよい。外部通信は行わないため、追加のバックエンド設定は不要。
