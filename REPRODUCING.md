# 不具合の再現

`scripts/reproduce.cjs` はブラウザの保存領域を変更せず、正式計算器と実際の対局セッションを使って指定した操作だけを再現する。通信は使わない。

まず `pnpm build:core` を実行する。次の内容を `case.json` として保存する。

```json
{
  "schemaVersion": 1,
  "initial": {"seed": 123, "mode": "ONE_HAND", "difficulty": "strong", "now": 100},
  "commands": [
    {"type": "step", "now": 101},
    {"type": "act", "now": 102, "action": {"type": "DISCARD", "tileIndex": 0}},
    {"type": "step", "now": 103},
    {"type": "pause"}
  ]
}
```

```sh
node scripts/reproduce.cjs --input case.json --output report.json
```

同じ入力・ソース・依存バージョンなら、最終保存データとSHA256が一致する。`now` は固定の非負整数を指定する。牌の位置は表示上の並びではなく、保存された手牌配列の0始まりの位置を使う。選べる操作はレポートの `legalActions` で確認できる。

保存データから再開する場合は `initial` を `{"save": 保存JSONの内容}` に置き換える。アプリの保存エラー画面から書き出したJSON、または前のレポートの `finalSave` を使用できる。不正な保存はアプリと同じ検証で拒否する。

| 操作 | 動作 |
| --- | --- |
| `step` + `now` | CPU等の自動遷移を最大1回だけ実行。人間の判断待ちでは止まる |
| `act` + `now` + `action` | 人間の合法操作を実行 |
| `pause` / `resume` | 進行の停止／停止解除。解除だけではCPUを進めない |
| `continue` + `now` | 局結果から次の局または最終結果へ |

失敗すると、その操作番号・エラー名・操作前後のハッシュを記録して止まり、終了コード1を返す。後続操作は実行しない。既存のレポートは上書きしないため、再実行では別名を指定する。

レポートには未公開の山・CPU手牌も含まれる。再現調査のためのローカル資料であり、対局中のCPU判断にこのレポートを渡すことはない。
