# CLAUDE.md

このファイルは Claude Code がこのリポジトリを理解するための説明書です。
（人間が読んでも構いませんが、編集の手順は `docs/05_ClaudeCode利用ガイド.md` を参照してください）

---

## プロジェクト概要

長坂コーテング株式会社の現場タブレット用アプリ。開発：ミヤマ工業株式会社 品質管理部。

| ファイル | アプリ | 状態 |
|---|---|---|
| `outline.html` | アウトライン工程（製品情報閲覧・作業指示・実績記録・評価） | テスト中 |
| `nagasaka.html` | 生産計画（A/Bライン・掛け/降ろし/出荷） | **本番稼働中** |

## 最重要の前提

- **1つのHTMLファイルが丸ごと1つのアプリ。** ビルド工程もパッケージ管理も無い。`outline.html` を直接編集する。
- `npm install` や `npm run build` は**存在しない／不要**。
- ライブラリは全てCDNから読み込み：React 18 UMD + Babel Standalone + Firebase 8.10.1 + QRious 4。
- **JSXを書くスクリプトは必ず `<script type="text/babel">` の中。** これを忘れると `Unexpected token '<'` で真っ白になる。
- `main` に push すると GitHub Actions が GitHub Pages へ自動公開する（2〜3分）。

## 公開URL

- https://nagasakacoating.github.io/nagasaka-apps/ （入口）
- https://nagasakacoating.github.io/nagasaka-apps/outline.html
- https://nagasakacoating.github.io/nagasaka-apps/nagasaka.html
- 生産計画の本番は別配信：https://nagasakacoating.github.io/nagasaka.html

---

## outline.html のコード構造

`/* ══════════ 見出し ══════════ */` で区切られている。だいたいの位置：

| 区分 | 内容 |
|---|---|
| Firebase | 接続設定（**変更禁止**） |
| 機能フラグ | `QR_ENABLED` — QR読取機能の一括ON/OFF。現在 `false` |
| 配色 | `NAVY` `BLUE` `LINE` など |
| 工程一覧 | `PROCESSES` — 10工程。`id`(`p1`〜`p10`)・`no`・`ja`・`id_`・`icon` |
| 情報ページ一覧 | `INFO_PAGES` — 製品情報13項目 |
| UI辞書 | `DICT` — 日本語→インドネシア語の対訳表 |
| 自動翻訳 | `TRANSLATE_URL` 経由でJP→ID翻訳 |
| 汎用コンポーネント | `TopBar` `FooterBar` `FBtn` `NumBadge` `WarnBox` `TapPhoto` `TH` など |
| 画面 | Login → ProcessSelect → WorkPlanScreen（計画表＝工程のホーム） |
| | SearchScreen（製品検索）→ InfoViewer（情報13項目） |
| | MasterAdmin / MasterEditor（マスター管理・タブ式） |
| | SchedulePlanner（スケジュール編集）→ WorkSheetScreen（要領書確認）→ WorkRunScreen（実行）→ ResultModal（完了リザルト） |
| | WorkHistory（履歴）/ AnalyticsScreen（評価グラフ） |
| アプリ本体 | `App()` — 購読とルーティング |

### 多言語の扱い

- UIラベル：`t('文字')`＝現在の言語のみ／`b('文字')`＝「日本語 / Indonesian」併記。辞書は `DICT`。
- テーブル見出しは `<TH k="数量"/>` で2段表示（幅節約のため）。
- データ側：`dv(obj,'name',lang)`（文字列）／`dva(obj,'notes',lang)`（文字列配列）。
  インドネシア語は `name_id` のように `_id` サフィックスに保存。`_src` は翻訳元の日本語で、
  日本語が変わった項目だけ再翻訳するために使う。

---

## データ構造（Firestore）

プロジェクト `personal-60023`。詳細は `docs/03_データ構造.md`。

| コレクション | 内容 |
|---|---|
| `outlineMaster` | 製品マスター。ドキュメントID＝**呼称**（例 `A-123`）。`partNo`(品番) `procIds`(通る工程) `sheets.{工程id}`(要領書＋1箱工数 `kosu`) など |
| `workOrders` | 作業指示＝計画行＋実績が1文書。`status` pending/running/paused/done |
| `procSettings` | 工程ごとの `startTime` と `breaks`（休憩） |
| `workers` | 担当者 |
| `master` `plans` `anomalyTypes` | 生産計画アプリ用（別系統） |

### 計算の要点

```
標準時間 = 1箱工数 × (完了箱数 + 端数 ÷ 収容数)
実働時間 = (終了 − 開始) − 休憩・一時停止
先行遅れ = 標準時間 − 実働時間        ＋なら先行
評価     = 先行遅れ + adjustMin（管理者調整）   ← effDiff()
```

計画表の開始/終了予定は `buildTimeline(rows,settings)` が算出。
`addWork(start,dur,breaks)` が**休憩帯をまたぐ分を後ろ倒し**する。

---

## 編集時のルール

### 絶対にやらないこと

1. **`PROCESSES` の `id`（`p1`〜`p10`）を変更しない。** 登録済みマスターと作業指示がこのIDで紐付いている。
2. **Firebase の設定値（`firebaseConfig`）を変更しない。**
3. **GitHubトークンやパスワードをコードに書かない。** このリポジトリは公開されている。
4. **`nagasaka.html` は本番稼働中。** 現場の作業時間中に変更しない。変更は昼休み・終業後に。

### 変更したら必ず確認すること

ローカルでブラウザ確認する場合は、**Firebaseに実データが書き込まれる**点に注意。
壊す心配のある変更は、スタブに差し替えて検証するのが安全（過去の検証ではインメモリの
Firestoreスタブを作って全画面を通した）。

最低限、以下は確認する：

- ブラウザのコンソールにエラーが出ていないか
- 画面が真っ白になっていないか（＝JSXの書き間違い）
- 変更した画面が意図どおり表示されるか

### 公開（デプロイ）

```bash
git add -A
git commit -m "何を直したか"
git push
```

→ GitHub Actions が走り、2〜3分で公開。**Actions タブが緑なら成功、赤なら失敗。**
失敗したら直前のコミットを `git revert` して戻す。

---

## よくある依頼と対応箇所

| 依頼 | 見るところ |
|---|---|
| 工程名を変えたい・増やしたい | `PROCESSES`（`id` は変えない） |
| 画面の文字を変えたい | 該当文字列を検索。ID訳も直すなら `DICT` |
| インドネシア語訳を直したい | `DICT`、またはマスターの `_id` フィールド |
| 文字を大きく／色を変えたい | `fontSize:` `color:` |
| QRリーダーを導入した | `QR_ENABLED=false` → `true` |
| 表が画面からはみ出す | `<TH>`で見出し2段化・列幅調整・`overflowX:'auto'` |
| 始業・休憩時刻 | コード変更不要。アプリの「⏰ 始業・休憩設定」で設定 |
| 情報項目を増やしたい | `INFO_PAGES` に追加 → `PageBody` に表示を追加 → `MasterEditor` に入力欄を追加 |

---

## 困ったときの復旧

```bash
git log --oneline -5        # 履歴を見る
git revert <コミットID>      # 特定の変更を取り消す
git push                    # 取り消しを公開
```

GitHubのWeb画面なら Commits → 該当コミット → **Revert** でも同じことができる。

---

## 連絡先

アプリの不具合・Firebase・翻訳機能に関することは
**ミヤマ工業株式会社 品質管理部 杉本** へ。
