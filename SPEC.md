# アリサ — アプリケーション仕様書

**バージョン**: 1.6  
**最終更新**: 2026-07-08  
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
- **Web版のみ**、公開URLを「特定の顧客本人」だけに使わせる目的で、任意の**パスワードゲート**（サーバー非依存のクライアント側アクセスコード）を持てる。これはサーバー認証ではなく、URLを知った部外者を気軽に使わせない casual deterrent（詳細は §11）

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

Mac/Win版とは独立した別ビルド。iPad Safari / PCブラウザで使う。詳細は `web/README.md` / `web/DEPLOY.md`。

**現行アーキテクチャ（都度処理・BYOK・端末内完結）**: サーバー無し・データベース無し・ログイン無しの**純粋な静的SPA**。OCRはクライアント本人のAnthropicキーで**ブラウザから直接**呼ぶ（BYOK）。データはその端末の**IndexedDB**に保持し、オーナー側インフラ・課金はゼロ。（※2026-06の旧構成＝Supabase＋サーバー関数＋招待制「Model 1」は廃止。移行経緯は下記PR履歴を参照。）

**スタック**: Vite + React + TS + Tailwind。静的ホスティング（Vercel等・**環境変数不要**）。`@shared`→ルート`shared/`をエイリアス参照（コピーせず型共有）。Mac版のUI資産（`components/ui`・`pages`・`stores`・`lib/file-to-base64`）を流用。

**データ層** (`web/src/lib/local-db.ts`): IndexedDB(DB名`arisa`)。ストア `receipts / projects / rules / images / usage / meta(設定・採番)`。数値IDは**単一readwriteトランザクションで採番**し並列取込(並列度3)でも重複しない。Electron IPC `window.api`(AppApi) をこのローカル実装(`web/src/lib/api.ts`)に差し替え、`main.tsx` で `window.api = api` 代入（`AuthGate`撤去＝ログイン無しで `App` 直描画）。
- 都度処理＝履歴を残さない運用だが、端末内保存によりリフレッシュ/誤クローズでの消失を防ぐ。iOS Safari は script-writable storage を約7日で消去(ITP)するため、**「ホーム画面に追加」(PWA化)で永続化**するのが前提。データは端末間で同期しない。

**OCR（ブラウザ直叩き）** (`web/src/lib/ocr.ts`): `@anthropic-ai/sdk` の `dangerouslyAllowBrowser` で Claude Vision を直接呼ぶ（本人の鍵を本人の端末から使う用途）。プロンプト/スキーマ(zod)/JSONパースは旧`api/ocr.ts`から移植。取込は手元のbase64をそのまま使い(Storage往復なし)、**ルール適用・status判定・鍵マスク・`api_usage`記録はクライアント側**(`api.ts`)。モデルは設定既定の `claude-haiku-4-5-20251001` 固定（1枚 約¥0.5）。**課金はOCRのみ、仕分け・計算は無料。**

**鍵(BYOK)** (`web/src/lib/local-key.ts`): APIキーは**この端末(localStorage)にのみ保存**、サーバーへ送らない。Settingsにキー入力カード（保存/削除/表示切替・`sk-ant-`形式ヒント・端末内保存の説明・**Spend Limit案内**・コンソールリンク）。`getSettings().hasApiKey` は鍵の有無を反映。キー未設定での取込/再OCRは明確なエラー→トースト通知。

**集計（Summary）** (`web/src/pages/Summary.tsx`・ナビ「集計」): 期間（デフォルト当月・ローカル日付でTZずれ回避）・案件・「確定済みのみ」で絞り込み、勘定科目別／支払方法別に件数・金額合計・税額を集計表示（KPI＋構成比バー付きテーブル）。`failed`/`processing`は金額不定のため対象外、日付未設定は期間集計から除外し件数のみ注記。**計算はすべてブラウザ内で完結し従量課金は発生しない**。クライアントの主要ニーズ「計算の自動化にコストをかけたくない」に構造的に合致。

**提供形態（BYOK）**: クライアント本人のAnthropicキーを本人のiPadで使用（オーナーが初期設定を代行可）。オーナーは静的サイトを配るだけ＝インフラ・OCR課金・保守ゼロ。安全策として **Anthropic Spend Limit** を前提とし、部外者対策として任意の**パスワードゲート**（下記）を用意する。

**パスワードゲート（任意・部外者対策）** (`web/src/lib/access-gate.ts` / `web/src/components/AccessGate.tsx`): 公開URLを「特定の顧客本人」だけに使わせるための、サーバー非依存のクライアント側アクセスコードゲート。部外者はまっさらなブラウザで来るため期待コードは**ビルドに焼き込む**（PBKDF2-SHA256+saltの**ハッシュ**を定数 or `VITE_ACCESS_*` に持たせ、**平文はバンドルに載せない**）。`main.tsx` で `<App/>` を `<AccessGate>` で包み、ハッシュ設定時は正しいパスワードを入れるまで App を描画しない（＝ロック中はIndexedDBを読まない）。正解した端末は `localStorage['arisa.access']`（現ハッシュの指紋）に解錠を記録し以後は素通り、パスワードを変更（ハッシュ差し替え）すると既存端末も再ゲート＝流出コードの失効に対応。パスワードは開発者が管理し（顧客の設定操作なし）、`node web/scripts/gen-access-code.mjs '<パスワード>'` が出力する定数を `access-gate.ts` に貼って `main` push で反映。**ハッシュ未設定ならゲート無効＝素通り**（opt-in）。パスワードは8文字以上を推奨（ハッシュがバンドルに載るため）。**限界**: 静的公開アプリのため技術者はバンドル/チェックを回避し得る casual deterrent であり、データ暗号化でもサーバー認証でもない。厳密な遮断が必要な場合はエッジ/サーバー側認証を別途設計（本版は未実装。PIN由来鍵でIndexedDBをAES-GCM暗号化する拡張余地もあり）。

**実装経緯（PRベース・GitHub `ops324/receipt-sorter-ai`）**:
- **#1 (merged)**: 集計ページ ＋ BYOK段階1（OCRをサーバー関数→ブラウザ直叩き、鍵を端末保存、Settingsキーカード復活）。
- **#2 (merged)**: Supabase全撤去・都度処理化（`local-db.ts`新設・`api.ts`全面ローカル実装・`AuthGate`撤去＝ログイン不要）。ローカルプレビューで実起動確認。バンドル 1002KB→784KB（Supabaseクライアント除去）。
- **#3 (merged)**: 静的デプロイ準備（デッド関数`api/ocr.ts`削除→純粋静的化・`DEPLOY.md`全面刷新）。
- **#4 (本PR)**: パスワードゲート追加（`access-gate.ts`/`AccessGate.tsx`・ビルド埋め込みハッシュ・localStorage解錠・部外者締め出し）。ゲート無効時は素通り。`tsc`/`build` 通過、プレビュー(port5174)で解錠/誤コード/リロード素通り/純静的出力を確認。

**デプロイ**: 純粋静的。Vercel(Root Directory=`web` / Framework=Vite / **環境変数不要**)へImport→Deployで公開、以降 `main` push で自動再デプロイ。手順・iPad実機チェックリストは `web/DEPLOY.md`。`tsc`/`npm run build` 通過、ローカルプレビュー(`web` / port5174)で起動確認済。

**未実装・残**:
- **ファイル書き出し（CSV/Excel/PDF/ZIP）未実装**（`exportData`は準備中エラー）。都度処理では書き出しが実質の記録になるため優先度高め。
- **段階4クリーンアップ**: 未参照の死蔵 `Login.tsx` / `lib/supabase.ts` / `web/supabase/` / `@supabase/supabase-js`依存 の撤去。
- iPad実機での `pdfjs` プレビュー動作は未検証（`pdf.worker` は自己ホストでバンドル＝CDN非依存）。

**Mac/Win版との関係**: 別ビルド・データ非同期。`electron/`・既存`src/`・`forge.config.ts` は不変。
