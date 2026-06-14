# アリサ Web版 デプロイ手順書 ＆ iPad実機チェックリスト

iPad Safari で使える状態にするための、迷わない順序の手順書。
所要時間の目安: 30〜45分（アカウント作成済みなら）。

- 構成: **Supabase**（DB/Storage/Auth）＋ **Vercel**（フロント配信＋OCR関数）
- 鍵やパスワードを含む操作は**あなた自身が**行う。詰まったら都度開発側（Claude）が修正で支援。

---

## 用意するもの

| 必要なもの | 入手先 |
|-----------|--------|
| Supabase アカウント | https://supabase.com （中心銘と同じアカウントで可） |
| Vercel アカウント | https://vercel.com （GitHub連携が楽） |
| Anthropic APIキー | https://console.anthropic.com → API Keys（`sk-ant-...`） |
| このリポジトリのGitリモート | GitHub等（Vercelが参照する） |

> ⚠️ Anthropicコンソールで **Spend Limit（支出上限）** を必ず設定しておくこと。鍵はサーバー（Vercel環境変数）が保持し、OCR課金は所有者持ちになるため。

---

## STEP 1. Supabase プロジェクト作成

1. https://supabase.com → New project。リージョンは **Northeast Asia (Tokyo)** を推奨。
2. データベースパスワードは控えておく（後で使わないが念のため）。
3. 作成完了まで数分待つ。

## STEP 2. スキーマ適用

1. 左メニュー **SQL Editor** → New query。
2. [`supabase/schema.sql`](supabase/schema.sql) の中身を全部貼り付けて **Run**。
3. エラーなく完了すれば、5テーブル（receipts/projects/rules/settings/api_usage）＋RLS＋Storageバケット `receipts` が作られる。
4. 確認: 左メニュー **Table Editor** に5テーブル、**Storage** に `receipts` バケットが見えること。

## STEP 3. 公開サインアップを無効化（招待制）

1. 左メニュー **Authentication** → **Sign In / Providers**（または Settings）。
2. **「Allow new users to sign up」を OFF** にする。
   - これをやらないと誰でも登録できてしまう。**必須**。

## STEP 4. ユーザーを手動作成して UUID を控える

1. **Authentication** → **Users** → **Add user** → **Create new user**。
2. 自分のメール＋パスワードで作成（「Auto Confirm User」を ON にして確認メールを省略）。
3. 友人（クライアント）の分も同様に作成。
4. 各ユーザーの行をクリックして **User UID（UUID）** をコピーして控える。
   - 例: `a1b2c3d4-....`。後で `ALLOWED_USER_IDS` に入れる。

## STEP 5. 接続情報を控える

左メニュー **Project Settings** → **API**:

| 値 | 用途 | ブラウザ露出 |
|----|------|------------|
| **Project URL** (`https://xxxx.supabase.co`) | `VITE_SUPABASE_URL` と `SUPABASE_URL` の両方 | URLのみ可 |
| **anon public** キー | `VITE_SUPABASE_ANON_KEY` | 公開OK（RLSで保護） |
| **service_role** キー | `SUPABASE_SERVICE_ROLE_KEY` | 🚫 **絶対に公開しない** |

> service_role キーはRLSを貫通する管理鍵。`/api/ocr`（サーバー側）だけが使う。`VITE_` を付けない＝ブラウザに出ない。

---

## STEP 6. Vercel にデプロイ

1. https://vercel.com → **Add New… → Project** → このリポジトリを Import。
2. **設定で必ず**:
   - **Root Directory = `web`**（リポジトリ直下ではない。Mac版と同居しているため）
   - Framework Preset: **Vite**（自動検出されるはず）
   - Build Command / Output: 既定（`npm run build` / `dist`）でOK
3. **Environment Variables** に以下を登録（[`.env.example`](.env.example) 参照）:

| 変数名 | 値 | 種別 |
|--------|----|----|
| `VITE_SUPABASE_URL` | Project URL | 公開 |
| `VITE_SUPABASE_ANON_KEY` | anon public キー | 公開 |
| `SUPABASE_URL` | Project URL（同じ値） | 関数用 |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role キー | 🚫秘匿 |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | 🚫秘匿 |
| `ALLOWED_USER_IDS` | STEP4のUUIDをカンマ区切り（自分,友人） | 関数用 |
| `MONTHLY_OCR_LIMIT` | `1000`（1ユーザー月次上限。コスト天井） | 関数用 |
| `OCR_MODEL` | 任意。OCRモデルをオーナーが固定（未設定なら最安haiku）。例 `claude-haiku-4-5-20251001` | 関数用 |

> 💡 **モデルはここ（`OCR_MODEL`）でオーナーが固定**します。クライアントは設定画面でモデルを選べません（OCR代はオーナー負担のため、コストを一元管理）。精度を上げたい場合は `claude-sonnet-4-6` 等に変更して Redeploy。

4. **Deploy** を押す。完了するとURL（`https://xxxx.vercel.app`）が発行される。

> 環境変数を後から変更した場合は、Vercel で **Redeploy** が必要（ビルド時に焼き込まれる `VITE_*` のため）。

---

## STEP 7. iPad 実機チェックリスト

iPad の **Safari** で発行URLを開き、上から順に確認する。✅が全部付けばiPadで使える状態。

### 7-1. 基本
- [ ] ページが表示される（ログイン画面が出る）
- [ ] STEP4で作ったアカウントで**ログインできる**
- [ ] ログイン後、サイドバー／各画面（インボックス・一覧・案件・ルール・エクスポート・設定）が表示される
- [ ] 設定画面に**APIキー入力欄が無い**（Web版はサーバー保持。残っていたら要修正）

### 7-2. 取込 → OCR（コア機能・最重要）
- [ ] インボックスで取込ボタン →「**写真を撮る**」「**ファイルを選択**」が出る（`<input type="file">`）
- [ ] iPadのカメラで領収書を撮影 → アップロードが始まる
- [ ] 「処理中」→ しばらくして「**要確認**」または「確定済」に変わる（＝OCR成功）
- [ ] 読み取り結果（店名・金額・日付）が一覧に出る
- [ ] **複数枚**を一度に選んで取込 → 進捗バーが進み、全部処理される

### 7-3. プレビュー（⚠️ 既知の要確認ポイント）
- [ ] 画像領収書（JPEG/PNG）のプレビューが一覧の編集パネルで表示される
- [ ] **PDF領収書のプレビューが表示される**（← `pdfjs` の iOS Safari 動作。ここが唯一の不安箇所。崩れたら開発側で対処）

### 7-4. 編集・管理
- [ ] 編集パネルで店名・金額・科目・案件・支払方法を変更 → 保存される
- [ ] 一覧のソート・フィルタ・検索が効く
- [ ] 案件を作成・編集・削除できる
- [ ] ルールを追加 → 該当店名の領収書に科目が自動付与される
- [ ] 領収書を削除できる（原本・サムネもStorageから消える）
- [ ] 月次コスト試算（枚数・概算円）が表示される

### 7-5. 未実装（今はNGでOK・M4で対応予定）
- [ ] エクスポート（CSV/Excel/PDF/ZIP）→ **「準備中」エラーが出る**のが現状の正常動作

---

## トラブル時の切り分け

| 症状 | 見るところ |
|------|-----------|
| ログインできない | STEP3でサインアップOFF＋STEP4でユーザー作成済みか。メール未確認なら Auto Confirm |
| 取込で「このアカウントはOCRを利用できません」(403) | `ALLOWED_USER_IDS` にそのユーザーのUUIDが入っているか |
| 取込で500「サーバー設定が未完了」 | Vercelの `SUPABASE_URL`/`SERVICE_ROLE_KEY`/`ANTHROPIC_API_KEY` 抜け |
| OCRが必ず failed | Anthropicキーの有効性・残高、Vercel関数ログ（Vercel→Deployments→Functions）を確認 |
| OCRが429 | 月次上限到達。`MONTHLY_OCR_LIMIT` を調整して Redeploy |
| 画面は出るがデータが空・保存できない | `VITE_SUPABASE_*` の値ズレ、またはRLS（schema.sql再実行） |
| 変更が反映されない | 環境変数変更後は Vercel で Redeploy |

---

## 関連
- アーキテクチャ・マイルストーン: [`README.md`](README.md)
- 全体仕様: ルート [`../SPEC.md`](../SPEC.md) §11
