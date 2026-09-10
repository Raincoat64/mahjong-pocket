# GitHub Pagesへの配布

GitHubへ載せるソースのルートに `package.json` と `.github/workflows/pages.yml` を配置する。配布準備フォルダーはこの構成になっている。

1. リポジトリの Settings → Pages → Build and deployment で Source を **GitHub Actions** にする。
2. 既定ブランチへソースをpushする。Actionsの **Publish Mahjong Pocket** がコア検証、ビルド、Pagesへの配置を行う。
3. 成功したdeployジョブのURLをiPhoneのSafariで開く。
4. アプリの設定で「オフライン準備済み」を確認する。
5. Safariの共有メニューからホーム画面へ追加し、そこからも起動を確認する。

URLは通常 `https://ユーザー名.github.io/リポジトリ名/`。素材、manifest、service workerは相対URLなのでリポジトリ名をソースへ埋め込まない。末尾の `/` を含む公開URLを使用する。

## iPhoneでの受け入れ確認

- 一局戦で打牌・鳴き・和了または流局・最終結果まで進める。自分の鳴き選択では手牌がぼけないことを確認する。
- 人間の手番、CPU進行中、鳴き選択中に中断し、手牌・点数・手番・河を記録する。
- ホーム画面への移動、Safariを閉じて開き直す操作を行い、同じ場面へ戻ることを確認する。
- 初回準備後に機内モードにし、Safari／ホーム画面から起動・一局完走・中断・再起動ができることを確認する。
- 更新前に中断する。接続を戻して更新を取得し、旧画面をすべて閉じて開き直した後も同じ局面に戻ることを確認する。
- 操作しにくい牌、切れる文字、重なる表示、長い待ちがあれば機種・iOS版・場面を記録する。

実機で未確認の項目を合格扱いにしない。PCのlocalhostで遊んだ保存はGitHub Pagesへ自動移動しない。公開後は同じURLで更新すると、その保存先を使い続けられる。

構成は[GitHub公式のPagesワークフロー](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)に基づく。
