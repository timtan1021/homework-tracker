import { Link } from "react-router";
import { CohortGate } from "../components/CohortGate";
import { useSetting } from "../hooks/useSetting";

function SettingsBody() {
  const showNames = useSetting("showStudentNames");

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="font-display text-ai text-2xl">設定</h1>

      {/*
        説明文をlabelの中に入れると読み上げ名が説明ごと連結されてしまう。
        aria-labelledby で見出しだけを名前にし、説明は describedby にする。
      */}
      <div className="border-kogan mt-6 flex items-start gap-3 border-b pb-4">
        {/*
          読み込み中は操作させない。初回読み取りが飛んでいる最中に切り替えると、
          あとから解決した読み取りが表示値を元に戻し、保存されていないように
          見えてしまうため（DBへの書き込み自体は成功している）。
        */}
        <input
          id="show-names"
          type="checkbox"
          checked={showNames.value}
          disabled={showNames.loading}
          onChange={(event) => void showNames.update(event.target.checked)}
          aria-labelledby="show-names-label"
          aria-describedby="show-names-description"
          className="mt-1 size-5 disabled:opacity-50"
        />
        <div>
          <label id="show-names-label" htmlFor="show-names" className="font-bold">
            氏名を表示する
          </label>
          <p id="show-names-description" className="mt-1 text-sm">
            名簿と印刷シートに氏名を出します。切っても入力した氏名は残ります。
          </p>
        </div>
      </div>

      <Link to="/roster" className="text-ai mt-8 inline-block underline">
        名簿に戻る
      </Link>
    </main>
  );
}

export function Settings() {
  return (
    <CohortGate>
      <SettingsBody />
    </CohortGate>
  );
}
