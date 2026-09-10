# Mahjong Pocket 0.6.0-rc.3

[Safariで公開版を開く](https://raincoat64.github.io/mahjong-pocket/)

スキマ時間に遊ぶ四人CPU麻雀。一局戦・東風戦、弱い・普通・強いCPUを備えます。通信対戦・アカウント・広告・外部解析はありません。

## 遊び方

- 牌をタップして選び、もう一度タップして打牌。選択した牌を拡大表示します。設定で1タップ操作にもできます。
- 捨て牌をタップすると河・副露を大きく確認できます。確認中は対局を停止します。
- 鳴き成立時は、誰が鳴いたかと「ポン・チー・カン」を画面中央に表示します。
- 自分の鳴き・カンを選ぶ間は、手牌にぼかしをかけません。
- 局結果の「手牌を確認」から、4人の終局時の手牌・副露を拡大できます。
- 「中断」で保存します。通常の打牌・CPU進行でも状態変更ごとに保存します。再起動時は同じ場面が自動的に開き、中断していた場合は中断中のまま戻ります。
- 初回のオフライン準備後、対局・点数計算・保存・再起動に通信は不要です。更新確認は接続時に行います。

## 起動と配布

配布ZIPには dist/ と scripts/serve.cjs が入っています。Node.jsがあるPCでは、展開先で次を実行できます。追加のnpmパッケージは不要です。

~~~sh
node scripts/serve.cjs
~~~

通常は http://127.0.0.1:4175/ です。別ポートは環境変数 PORT で指定します。終了はCtrl+Cです。

Safariへ配布する場合、dist/ の内容をHTTPSの静的ホスティングに配置します。対局サーバーは不要です。HTMLファイルの直接開きではオフライン機能は動作しません。iPhoneから別PCのlocalhostには接続できません。

趣味用の配布先はGitHub Pagesを想定しています。[公開とiPhone確認の手順](GITHUB_PAGES.md)に沿って設定すると、同梱のGitHub Actionsが検証・ビルド・配布を行います。

保存先はブラウザとURLのオリジンごとです。ポート・ドメイン・ブラウザを変えると別の保存先になります。通常の更新は同じURLへ配置してください。旧版の画面がすべて閉じた後に更新し、対局中の強制再読み込みは行いません。

複数の画面で開いた場合、古い場面からの保存が最新の保存を上書きすることを防ぎます。競合した画面では「最新の保存を開く」で戻れます。競合前の手元の場面も書き出せます。

## 開発

検証環境: Windows / Node 24.19.0 / pnpm 11.19.0。依存関係は pnpm-lock.yaml に固定しています。

~~~sh
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm serve
~~~

build はライセンス生成、Vite production build、オフライン一覧生成を順に実行します。正式計算は vendor/majiang-core-v1.4.1/ をアダプター経由で利用します。開発モードではキャッシュを登録しません。

~~~sh
pnpm test:core
pnpm stress
pnpm stress:match
node scripts/benchmark-cpu.cjs 100
~~~

ブラウザ試験には別途Playwrightが必要です。今回は1.62.1のWebKit 26.5を使用しました。PLAYWRIGHT_MODULEでモジュールパス、PLAYWRIGHT_BROWSERS_PATHでブラウザ保存先、TEST_URLで画面試験のURLを指定できます。通常インストールでは前二者は省略可能です。

## 状況と資料

主な対象はiPhoneの縦画面です。WebKitで6種類の表示領域、鳴き選択時のぼかし解除、終局までの実操作、破損回復、保存失敗、複数画面の競合防止、オフラインでの一局完走、更新時の局面維持を検証済み。iPhone/Mac Safari実機とAndroid実機のインストール・性能確認は未実施のため、リリース候補としています。

- [検証結果](TEST_REPORT.md)
- [レビューと残る確認事項](REVIEW_REPORT.md)
- [商用転用時に保持するライセンス](THIRD_PARTY_LICENSES.md)
- [保存データと操作列から不具合を再現](REPRODUCING.md)

現行画面は web/App.jsx と web/app.css。playable-preview/、web/table.css、web/layout.json は移行前の資料を含みます。2026-09-10のユーザー依頼により従来の画面固定方針を解除しました。
