# アリサ — アプリケーション仕様書

**バージョン**: 1.5  
**最終更新**: 2026-06-15  
**対象プラットフォーム**: macOS (Apple Silicon / Intel) ／ Web（iPad Safari・PCブラウザ。§11 Web版）

---

## 1. 概要

アリサは、撮影業・映像制作プロフェッショナル向けの領収書仕分け自動化デスクトップアプリです。  
Claude Vision API（Anthropic）を用いて領収書画像・PDFから情報を自動抽出し、会計ソフト向けエクスポートまでを一元管理します。

### 主な機能

| 機能 | 説明 |
|------|------|
| OCR自動読み取り | 画像・PDFをドラッグ＆ドロップするだけで取引先・金額・日付を抽出 |
| OCR信頼度表示 | 読み取り結果の信頼度（%）をカラーバッジで表示、要確認箇所を可視化 |
| OCR再試行 | 失敗・未確認の領収書を個別に再OCR実行可能 |
| 自動分類ルール | キーワードマッチで科目・支払方法を自動割当 |
| 案件管理 | 撮影案件ごとに領収書をグルーピング |
| 一括操作 | 複数領収書の一括確定・科目一括設定・一括削除 |
| 多形式エクスポート | CSV（freee / マネーフォワード対応）・Excel・PDF・フォルダ整理 |
| コスト管理 | 月次APIコスト試算（円換算）・大量インポート前のコスト確認 |

---

## 2. 技術スタック

| レイヤー | 技術 |
|---------|------|
| フレームワーク | Electron 33 + Vite + React 18 |
| UI | Tailwind CSS + shadcn/ui (Radix UI) + lucide-react |
| 状態管理 | Zustand 5 |
| データベース | SQLite (better-sqlite3) |
| AIモデル | Anthropic SDK (@anthropic-ai/sdk) |
| エクスポート | ExcelJS / pdf-lib (IPAGothicフォント) / pdfjs-dist |
| ビルド | Electron Forge 7 |

### 2.1 デザインテーマ（風水カラー）

財運・商売繁盛を意識した風水に則ったカラーパレットを採用。

| 要素 | カラー | 風水の意味 |
|------|--------|-----------|
| ブランド（アクセント） | 金色 / Amber `#d97706` | 金の気・財運・豊かさ |
| サイドバー背景 | 深翡翠緑 `#0e2318` | 木の気・成長・商売繁盛 |
| アプリ背景 | 温白 `#fffdf5` | 土の気・安定・信頼 |
| 成功・確定 | 翠緑 / Emerald | 発展・達成 |
| 警告・処理中 | 琥珀 / Amber | 注意・進行中 |
| エラー | 赤 / Red | 警告（必要な視覚信号） |

---

## 3. データモデル

### 3.1 Receipt（領収書）

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `id` | number | 主キー |
| `source_path` | string | 原本ファイルパス |
| `thumbnail_path` | string \| null | プレビュー画像パス |
| `ocr_raw` | string \| null | Claude APIのレスポンスJSON（生データ） |
| `vendor` | string \| null | 取引先名 |
| `issued_on` | string \| null | 発行日（YYYY-MM-DD） |
| `amount` | number \| null | 税込合計金額（円・整数・0以上） |
| `tax_amount` | number \| null | 消費税額（円・整数・0以上） |
| `payment_method` | PaymentMethod \| null | 支払方法 |
| `account_category` | AccountCategory \| null | 勘定科目 |
| `project_id` | number \| null | 案件ID（外部キー） |
| `memo` | string \| null | メモ |
| `status` | ReceiptStatus | 処理状態 |
| `confidence` | number \| null | OCR信頼度（0〜1） |
| `error` | string \| null | エラーメッセージ |
| `created_at` | string | 作成日時 |
| `updated_at` | string | 更新日時 |

**ReceiptStatus**

| 値 | 意味 |
|----|------|
| `processing` | API処理中 |
| `pending` | ユーザー確認待ち |
| `confirmed` | 確定済み |
| `failed` | 処理失敗 |

**AccountCategory**（勘定科目）

交通費 / 旅費交通費 / 交際費 / 会議費 / 消耗品費 / 通信費 / 新聞図書費 / 材料費 / 外注費 / 雑費

**PaymentMethod**（支払方法）

| 値 | 表示 |
|----|------|
| `cash` | 現金 |
| `card` | カード |
| `emoney` | 電子マネー |
| `transfer` | 振込 |
| `unknown` | 不明 |

---

### 3.2 Project（案件）

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `id` | number | 主キー |
| `name` | string | 案件名（必須） |
| `start_on` | string \| null | 開始日（YYYY-MM-DD） |
| `end_on` | string \| null | 終了日（YYYY-MM-DD） |
| `color` | string \| null | カラーコード（HEX） |

---

### 3.3 Rule（自動分類ルール）

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `id` | number | 主キー |
| `keyword` | string | 取引先名に対する部分一致キーワード（必須） |
| `account_category` | AccountCategory \| null | 自動割当する勘定科目 |
| `payment_method` | PaymentMethod \| null | 自動割当する支払方法 |
| `priority` | number | 優先度（0以上・数値が小さいほど先に評価） |

---

### 3.4 AppSettings（アプリ設定）

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `apiKey` | string \| null | Anthropic APIキー（macOS Keychain保管） |
| `hasApiKey` | boolean | APIキー設定済みフラグ |
| `model` | string | 使用するClaudeモデル |
| `defaultCategory` | AccountCategory | デフォルト勘定科目 |
| `csvDialect` | 'freee' \| 'mf' \| 'generic' | CSV出力形式 |
| `folderRoot` | string \| null | フォルダエクスポートのデフォルトパス |

---

## 4. 画面仕様

### 4.1 インボックス（Inbox）

**目的**: 領収書のアップロードと処理状況の確認

**機能**
- ドラッグ＆ドロップ / ファイル選択（JPEG・PNG・PDF対応）
- 複数ファイルの一括処理
  - 準備フェーズ：「ファイル準備中 X/Y件」のプログレスバー
  - OCRフェーズ：「AIで読み取り中 X/Y件」のプログレスバー（`receipts:import-progress` イベントで更新）
- **大量インポート確認ダイアログ**: 20枚以上をドロップした場合、コスト確認ダイアログを表示（「X枚・概算 ¥Y（1枚 ¥Z）」）。APIキー未設定時はスキップ
- ステータス別枚数カード（処理中・要確認・確定済・失敗）
  - 「処理中」カードのスピナーは、処理中の領収書が1件以上ある時のみ回転（0件時は静止）
- 月次APIコスト試算表示（枚数・合計円・1枚あたり円・モデル名）
- 確認待ち領収書がある場合、一覧への誘導バナーを表示
- **APIキー未設定バナー**: APIキー未設定時はヘッダ直下に常設バナーを表示し、設定画面への誘導ボタンを添える

---

### 4.2 領収書一覧（ReceiptList）

**目的**: 全領収書の閲覧・編集・確定

**機能**

*フィルタリング*
- テキスト検索（取引先名・メモ）
- ステータスタブ（すべて / 処理中 / 要確認 / 確定済 / 失敗）

*テーブル表示列*

| 列 | 内容 | 備考 |
|----|------|------|
| チェックボックス | 行選択（一括操作用） | 全選択チェックボックスをヘッダに配置 |
| 日付 | issued_on | クリックでソート（昇順/降順） |
| 取引先 | vendor | |
| 金額 | amount（円） | クリックでソート（昇順/降順） |
| 科目 | account_category | |
| 案件 | 紐付け案件名 | |
| 支払 | payment_method | |
| 状態 | ステータスバッジ | |

*ソート*
- 「日付」「金額」列ヘッダをクリックで昇順/降順を切替
- ソート中はヘッダに昇降アイコンを表示。未ソート時は上下アイコン

*一括操作バー*（1件以上選択時にテーブル上部に表示）
- **一括確定**: 選択中の全領収書を `confirmed` に変更
- **科目を一括設定**: ドロップダウンで科目を選択して一括変更
- **一括削除**: AlertDialog による確認後、選択中の全領収書を削除

*キーボード操作*
- テーブル行に `tabIndex={0}` ・Enter/Space キーで行を選択（編集パネルを開く）

*ローディング・空状態*
- 初回データ読み込み中はスケルトン行を表示
- 全件空の場合: アイコン＋「インボックスから領収書を追加してください」
- フィルタ結果が空の場合: 「該当する領収書が見つかりません」

*編集パネル（行選択時に右からスライドイン表示・Sheet）*

- 領収書画像 / PDFプレビュー
  - PDFでサムネイル未生成時：「Finderで原本を開く」ボタンを表示
- **ページ送りボタン（‹ ›）**: パネルヘッダに前後の領収書へ移動するボタン。先頭/末尾で無効化
- **信頼度バッジ**: OCR信頼度（confidence）を%表示でカラーコーディング
  - ≥70%: 緑（sage）
  - 40〜69%: 琥珀（amber）
  - <40%: 赤（red）
  - null: 非表示
- **保存フィードバック**: フィールド編集保存後、パネルヘッダに「✓ 保存済み」を約2秒表示
- **要確認フィールドの強調**: `pending` 状態かつ未入力の必須フィールド（取引先・日付・金額）は琥珀色のリングと「要確認」バッジを表示
- 編集フィールド: 取引先・日付・金額（0以上）・消費税額（0以上）・メモ
- ドロップダウン: 勘定科目・案件・支払方法
- **AIの読み取り元データ**: Claude APIレスポンスJSON（折りたたみ表示）
- エラーメッセージ表示
- **OCR再実行ボタン**: `failed` / `pending` のときフッタに表示。APIキー未設定時は無効化
- 削除ボタン（AlertDialog によるスタイル付き確認ダイアログ）
- 確定 / 確定解除ボタン

---

### 4.3 案件（Projects）

**目的**: 撮影案件の作成・編集・削除

**機能**
- 案件名（必須）・開始日・終了日・カラー入力フォーム
- **期間バリデーション**: 終了日 < 開始日の場合はエラートーストを表示して保存を中止
- Enterキーで保存
- 初回読み込み中はスケルトン行を表示
- 案件リスト（編集・削除ボタン付き）
- 削除時は AlertDialog によるスタイル付き確認ダイアログ表示
- 空状態: 「案件がまだありません。上のフォームから撮影現場やプロジェクトを登録できます。」

---

### 4.4 自動分類ルール（Rules）

**目的**: 取引先キーワードによる科目・支払方法の自動割当

**機能**
- キーワード（必須）・勘定科目・支払方法・優先度（0以上）の入力フォーム
- 優先度 `min={0}` — 負数は自動的に0に丸める
- 初回読み込み中はスケルトン行を表示
- ルール一覧（編集・削除ボタン付き）
- 優先度：数値が小さい順に評価、最後にマッチしたルールが適用
- 空状態: 「ルールがまだありません。上のフォームから追加できます。」

---

### 4.5 エクスポート（Export）

**目的**: 領収書データの多形式出力

**エクスポート形式**

| 形式 | 内容 |
|------|------|
| CSV | 汎用 / freee / マネーフォワード対応（UTF-8 BOM付き） |
| Excel (.xlsx) | 明細シート＋科目集計シートの2シート構成 |
| PDFレポート | IPAGothicフォント使用の月次レポート |
| フォルダ整理 | `YYYY-MM/科目/案件/日付_店名_金額.拡張子` の構造でファイルコピー |

**フィルタ条件**
- 期間（開始日〜終了日、デフォルト: 当月）
  - **期間バリデーション**: 開始日 > 終了日の場合、期間欄下に赤字エラーを表示しエクスポートボタンを無効化
- 案件（全案件 or 特定案件）
- 対象件数を常時表示。0件の場合は「期間内に領収書がありません」を添える

**操作フロー**
1. 期間・案件・形式を選択
2. エクスポートボタン（対象件数表示）クリック（対象0件・期間エラー時は無効）
3. 保存先ダイアログで出力先を指定
4. 完了後トースト通知 → Finderで出力先を開く

---

### 4.6 設定（Settings）

**目的**: APIキー・モデル・デフォルト設定の管理

**セクション**

*Anthropic APIキー*
- パスワード入力欄（表示/非表示切り替え）
- 保存・削除ボタン
- macOS Keychainに暗号化保存の旨を表示
- Anthropicコンソールへのリンク
- **形式チェック**: 入力値が `sk-ant-` で始まらない場合、入力欄下に柔らかい注意文を表示（保存は許可）
- **漏洩時の対処手順（常設表示）**: キー欄に「万一キーが漏れたら：Console で該当キーを失効（Revoke）→新キー発行→アプリで削除後に貼り直し。Spend Limit設定を推奨。漏れたキーはアプリ側では無効化できない」旨を常時表示

*モデル選択*

| モデル | 目安コスト | 用途 |
|--------|-----------|------|
| claude-haiku-4-5 | 約¥0.5/枚 | きれいな印字領収書 |
| claude-sonnet-4-6（推奨） | 約¥2/枚 | バランス重視 |
| claude-opus-4-7 | 約¥7/枚 | 手書き・複雑なレイアウト |

*デフォルト設定*
- デフォルト勘定科目（ドロップダウン）
- **CSV形式（会計ソフト）**: 汎用 / freee / マネーフォワード

---

## 5. OCR処理フロー

### 5.1 新規インポートフロー

```
ファイル投入（D&D or 選択）
    ↓
prepareFile() — PNG/JPEG に変換・リサイズ（最大1800px）
               PDF は1ページ目をPNG化
    ↓
window.api.importItems() → IPC → main.ts
    ↓
processImports() — SQLiteにレコード挿入（status: processing）
    ↓
Claude Vision API 呼び出し（設定モデルを使用）
    ↓
OcrExtraction パース（Zod スキーマ検証）
    ↓
自動分類ルール適用（優先度順）
    ↓
SQLite 更新（status: pending or failed）
    ↓
receipts:import-progress イベント → レンダラー側OCR進捗を更新
    ↓
receipt:changed イベント → レンダラー側の状態を更新
```

### 5.2 OCR再試行フロー（retryOcr）

```
「OCR再実行」ボタン押下（failed / pending の領収書）
    ↓
window.api.retryOcr(id) → IPC → main.ts（receipts:retry）
    ↓
retryOcr() — status を processing に更新 → receipt:changed
    ↓
thumbnail_path を読み込み、magic bytesでMIMEタイプを判定
（FF D8 → image/jpeg、それ以外 → image/png）
    ↓
runVision() — Claude Vision API 呼び出し
    ↓
OcrExtraction パース・ルール適用・SQLite 更新（status: pending or failed）
    ↓
receipt:changed イベント → レンダラー側の状態を更新
```

**retryOcr の前提条件**
- APIキー未設定時: `status: pending` ＋エラーメッセージを設定して返す（Vision API呼び出しなし）
- `thumbnail_path` が存在しない場合: `status: failed` ＋エラーメッセージ

### 5.3 エラーメッセージの秘匿化

- 例外発生時に DB の `error` 列へ保存・画面表示するメッセージは、`redactSecrets()` で `sk-ant-...` 等のAPIキー様文字列を伏字化してから記録する（万一の混入時も平文で残さない多層防御）

---

## 6. ファイル管理

| ファイル種別 | 保存先 | 説明 |
|------------|--------|------|
| 原本ファイル | アプリデータディレクトリ | インポート時にコピー |
| サムネイル | アプリデータディレクトリ | 画像の場合に生成・キャッシュ。OCR再試行でも使用 |
| データベース | アプリデータディレクトリ | SQLite (.db) |
| APIキー | macOS Keychain | 暗号化保管 |

- 領収書削除時: 原本ファイル・サムネイルもディスクから削除
- PDFはプレビューとしてサムネイルを別途生成

---

## 7. IPC チャンネル一覧

| チャンネル | 方向 | 概要 |
|-----------|------|------|
| `receipts:import` | invoke | ファイルインポート・OCR実行 |
| `receipts:retry` | invoke | 既存領収書のOCR再試行 |
| `receipts:list` | invoke | 一覧取得（フィルタあり） |
| `receipts:update` | invoke | フィールド更新 |
| `receipts:delete` | invoke | 削除（DBとファイル） |
| `receipts:original` | invoke | 原本取得（base64） |
| `projects:list` | invoke | 案件一覧取得 |
| `projects:upsert` | invoke | 案件作成・更新 |
| `projects:delete` | invoke | 案件削除 |
| `rules:list` | invoke | ルール一覧取得 |
| `rules:upsert` | invoke | ルール作成・更新 |
| `rules:delete` | invoke | ルール削除 |
| `settings:get` | invoke | 設定取得（APIキーを除く） |
| `settings:setApiKey` | invoke | APIキー保存（Keychain） |
| `settings:update` | invoke | 設定更新 |
| `cost:estimate` | invoke | 月次コスト試算 |
| `export:chooseDestination` | invoke | 保存先ダイアログ |
| `export:run` | invoke | エクスポート実行 |
| `os:reveal` | invoke | Finderで開く |
| `receipt:changed` | event（main→renderer） | 領収書変更通知 |
| `receipts:import-progress` | event（main→renderer） | OCRバッチ進捗通知（`{ done, total }`） |

**入力検証**: ID を受け取るハンドラ（retry / update / delete / original / projects:delete / rules:delete）は `reqId()` で非負整数を検証、`os:reveal` は `reqString()` で文字列を検証してから処理する（レンダラーを信頼しない多層防御）。

### 7.1 shared/ipc.ts — AppApi インターフェース（主要追加分）

```typescript
// OCRバッチ進捗
export interface ImportProgress { done: number; total: number; }

// OCR再試行（既存レコードを再処理）
retryOcr(id: number): Promise<Receipt>;

// OCRバッチ進捗の購読（戻り値: 解除関数）
onImportProgress(cb: (p: ImportProgress) => void): () => void;
```

---

## 8. セキュリティ

### 8.1 プロセス分離・レンダラー保護

- `contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`
- メインプロセスへのアクセスは `window.api`（preload の contextBridge）経由のみ。生の `ipcRenderer` は露出しない
- **ナビゲーション制御**: `setWindowOpenHandler` で新規ウィンドウ生成を一律拒否、`will-navigate` でアプリ自身のオリジン以外への遷移を遮断
- asar パッケージング + FuseV1 による改ざん検証（OnlyLoadAppFromAsar）

### 8.2 Content Security Policy（CSP）

- **本番ビルド**: メインプロセスがレスポンスヘッダで厳格CSPを強制（`script-src 'self'` / `object-src 'none'` / `base-uri 'none'` / `frame-src 'none'` / `connect-src 'self' https://api.anthropic.com` 等）
- **開発時**: Vite の都合上 `index.html` の meta CSP に委ねる（`script-src` を緩める）
- 外部通信は `api.anthropic.com`（HTTPS）のみ許可

### 8.3 APIキーの保護

- 保存: レンダラー→メインへ一度だけ平文送信（`settings:setApiKey`）し、`safeStorage`（macOS Keychain）で暗号化して SQLite に格納。暗号化が利用不可な環境では平文保存せずエラーにする
- 取得: `settings:get` は `hasApiKey`（真偽）のみ返し、**キー本体はレンダラーへ一切返さない**。復号した平文はメインプロセス内で Anthropic SDK に渡す瞬間のみ存在
- ログ出力（`console.*`）なし。エクスポート物にも含まれない
- **漏洩時の被害最小化**: エラーメッセージは `redactSecrets()` で伏字化（5.3）。漏れたキーはアプリ側では無効化できないため、Console での失効＋Spend Limit 設定が必須（設定画面に手順を常設）

### 8.4 入力検証・パス安全性

- IPC ハンドラは ID を `reqId()`（非負整数）、パスを `reqString()` で検証（7章）
- SQLite は全クエリがプリペアドステートメント＋バインド変数（SQLインジェクション不可）
- フォルダエクスポートのファイル名は `safeSegment()` でパス区切り文字・先頭ドットを除去（パストラバーサル防止）
- インポートファイルはランダムID名でアプリ専用ディレクトリに複製（任意パス参照なし）

### 8.5 認証について

- 本アプリはローカル完結のBYOK（各ユーザーが自分のAnthropic APIキーを使用）デスクトップアプリのため、ユーザーアカウント／ログインは設けない（守るべきサーバー側データ・課金が無く、認証は不要）
- 将来サーバーで領収書を預かる SaaS 化に進む場合は、その時点でユーザー認証・権限・サーバー側鍵管理を設計する

---

## 9. ビルド・配布

| コマンド | 内容 |
|---------|------|
| `npm start` | 開発モード起動（Vite HMR） |
| `npm run package` | `.app` 生成（`out/アリサ-darwin-arm64/`） |
| `npm run make` | DMG・ZIP 生成（配布用） |

**バンドル設定**（forge.config.ts）
- ネイティブモジュール: better-sqlite3, bindings, file-uri-to-path のみ同梱
- Bundle ID: `com.takimototetsuya.arisa`
- アイコン: `assets/icon.icns`

**コード署名・公証**
- 現状は未署名。友人へのBYOK配布では受け取り側が初回のみ「右クリック→開く」または `xattr -dr com.apple.quarantine` で Gatekeeper を通す運用で可
- 不特定多数へ配布する場合は Apple Developer ID 署名＋公証（notarize）が必要（`@electron/osx-sign` 設定を追加）

---

## 10. 既知の制約・注意事項

- OCRの精度はClaudeモデルと画像品質に依存する
- PDF対応は1ページ目のみ（複数ページ非対応）
- SQLiteは同期クエリのため、大量インポート時はUIがブロックする可能性がある
- APIコスト試算はあくまで目安（実際の課金はAnthropicコンソールで確認）
- Anthropicコンソールでの支出上限設定を推奨
- OCR再試行はサムネイル画像（thumbnail_path）を使用する。サムネイルが未生成の場合は再試行不可
- `pending` タブ表示中に OCR再試行を実行すると、status が `processing` に変わった時点で当該行がフィルタから外れパネルが閉じる（意図した動作）

---

## 11. Web版（iPad対応・`web/`）

Mac/Win版とは独立した別ビルド。iPad Safari / PCブラウザで使う。詳細は `web/README.md`。

**スタック**: Vite + React + TS + Tailwind / Vercel(サーバーレス関数 `api/ocr.ts`) / Supabase(Postgres + Storage + Auth)。Vercel Root Directory = `web/`。

**設計**:
- 既存UI資産（`src/components/ui`・`pages`・`stores`・`lib/file-to-base64`）を流用。`@shared`→ルート`shared/`をエイリアス参照（コピーせず型共有）。
- Electron IPC `window.api`(25メソッド) を `web/src/lib/api.ts`(Supabase実装) に差し替え、`main.tsx` で `window.api = api` 代入。CRUDはRLS直叩き、OCRのみ関数。
- 取込: クライアントがStorageへ原本/サムネをアップ + `processing`行をinsert → `/api/ocr` が Vision→ルール→status判定→行update→`api_usage`記録（1関数1枚, 並列度3）。

**マルチユーザー/セキュリティ**:
- 全テーブルに `user_id` + RLS(`auth.uid()`)。`projects` は `UNIQUE(user_id, name)`。スキーマは `web/supabase/schema.sql`。
- **BYOK廃止**: Claude鍵はVercel環境変数。**招待制**（公開サインアップ無効）+ `/api/ocr` で `ALLOWED_USER_IDS` 照合 + 月次OCR上限。

**マイルストーン**: M0認証/足場・M1 1枚OCR・M2 CRUD・M3複数枚/進捗/コスト上限 実装済（M3の孤児ファイル掃除も完了＝取込でアップ後にDB行作成失敗／部分アップ時にアップ済みStorageファイルを掃除。破壊的スイープは原本誤削除リスクのため不採用）。**集計ページ実装済**（`src/pages/Summary.tsx`。ナビ「集計」）。**M4ファイル出力(CSV/Excel/PDF/ZIP)は未実装**（`exportData`は準備中エラー）。

**集計（Summary）**: 期間（デフォルト当月・ローカル日付でTZずれ回避）・案件・「確定済みのみ」で絞り込み、勘定科目別／支払方法別に件数・金額合計・税額を集計表示（KPI＋構成比バー付きテーブル）。`failed`/`processing`は金額不定のため対象外、日付未設定は期間集計から除外し件数のみ注記。**計算はすべてクライアント側（ブラウザ内）で完結し、Claude API等の従量課金は発生しない**（既に読込済みの`receipts`ストアを集計するのみ）。クライアントの主要ニーズ「計算の自動化にコストをかけたくない」に構造的に合致。

**提供形態（Model 1）**: オーナーが1組のSupabase＋Anthropicキーを保持し、招待制でクライアントに相乗り提供（OCR代はオーナー負担）。クライアントはログインのみでSupabase/キーに触れない。
- **Settingsのキー入力UI撤去・完了**: Web版は鍵をサーバー保持のためAPIキーCardを撤去（既定値Cardのみ残す）。Inbox/ReceiptListの`hasApiKey`死に分岐（未設定バナー・トースト・再試行無効化）も除去。`hasApiKey`は常にtrue。
- **OCRモデルはサーバー固定**: `/api/ocr` が環境変数 `OCR_MODEL`（許可リスト照合・未設定なら最安`claude-haiku-4-5-20251001`）で一元決定。クライアント設定からは選ばせない（オーナーのコスト管理）。コスト試算の「1枚あたり」表示用に`api.ts`の既定modelもhaikuへ合わせ済。

**Mac/Win版との関係**: データ非同期（別DB）。`electron/`・既存`src/`・`forge.config.ts` は不変。

**デプロイ手順**: `web/DEPLOY.md` にSupabase作成→schema適用→招待制設定→Vercel環境変数→iPad実機チェックリストを集約。本番ビルド（`npm run build`）は通過確認済（`pdf.worker` は自己ホストでバンドル＝CDN非依存）。iPad実機でのpdfjsプレビュー動作のみ未検証（チェックリストの最重要確認項目）。
