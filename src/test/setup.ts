import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// vitest globals を有効にしていないため、@testing-library/react の
// 自動クリーンアップ（globalな afterEach を検出する仕組み）が働かない。
// 明示的に呼び出し、テスト間でレンダー結果が積み重ならないようにする。
afterEach(cleanup);
