# Third-party licenses

実際に配布へ含めるライブラリと素材を確認した。第三者コードはMIT、牌素材はCC0のパブリックドメイン宣言で、この一覧には商用利用を制限する依存ライセンスはない。MITの著作権表示と許諾全文は再配布時も保持する。

| 対象 | バージョン・出典 | ライセンス／用途 |
| --- | --- | --- |
| majiang-core | 1.4.1 / kobalab/majiang-core | MIT。正式計算。ローカルシャンテン実装も移植を含む |
| React / React DOM | 各19.2.8 | MIT。画面表示 |
| scheduler | 0.27.0 | MIT。Reactの処理スケジュール |
| Vite | 7.3.6 | MIT。ビルドと出力に含まれるmodule-preload補助コード |
| esbuild | 0.28.2 | MIT。ビルドと生成JavaScript補助コード |
| 牌SVG | FluffyStuff/riichi-mahjong-tiles | 上流Public Domain / CC0宣言を同梱 |

vendor/majiang-core-v1.4.1/ は公式タグから取得した未変更のランタイム。形式変換は src/adapter/majiang-core.ts に分離した。MIT原文はvendorのLICENSEにも保持する。

public/licenses.txt と THIRD_PARTY_VERSIONS.json は scripts/build-notices.cjs が生成する。dist/licenses.txt と dist/tiles/LICENSE.md を配布物から削除しない。アプリ設定からライセンスを開ける。依存更新時もビルドで表示を再生成する。

Vite・TypeScript・試験用パッケージなどの開発環境全体はブラウザ配布物に含めない。pnpm-lock.yaml がビルド用依存関係を固定する。node_modulesやビルドツール本体を別途配布する場合、そのパッケージのLICENSEも保持する。

Back-Pocket.svg とアイコンは本プロジェクト用に作成した独自図形。フォントファイルは配布せずシステムフォントを使う。独自実装部分の公開・非公開や配布ライセンスはプロジェクト所有者が決められる。第三者部分の表示義務は保持する。
