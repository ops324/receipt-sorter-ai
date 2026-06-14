# アリサ Web版（iPad対応・最小構成）

撮影業向け 領収書仕分けアプリ「アリサ」の Web 版。iPad Safari / PC ブラウザで使える。
Mac/Win 版（Electron）とは独立した別ビルドで、データは Supabase に保存する（両者は同期しない）。

- スタック: Vite + React + TypeScript + Tailwind / Supabase(Postgres + Storage + Auth) / Vercel(関数1本 `api/ocr.ts`)
- 認証: **招待制**（公開サインアップは無効化する）
- Claude APIキー: **サーバー(Vercel環境変数)が保持**。OCR課金は所有者持ち。

## アーキテクチャ

```
ブラウザ(既存UI流用) ─┬─ supabase-js + RLS  → Postgres   … CRUD
                     ├─ supabase-js        → Storage    … 原本/サムネ
                     └─ POST /api/ocr      → Vercel関数(鍵保持) → Claude Vision → 行update
```
`window.api`(Electron版IPC) は `src/lib/api.ts` の Supabase 実装に差し替え（`main.tsx` で代入）。

## セットアップ

> 📋 **本番デプロイ＋iPad実機確認は [`DEPLOY.md`](DEPLOY.md) に手順書・チェックリストあり**（迷わない順序でまとめた版）。以下は概要。

### 1. Supabase
1. プロジェクトを作成（中心銘と同じアカウントで可）。
2. SQL Editor で `supabase/schema.sql` を実行（5テーブル + RLS + Storage バケット `receipts`）。
3. **Authentication → Providers/Settings で公開サインアップを無効化**（招待制）。
4. Authentication → Users で、自分と友人のアカウントを手動作成。各 `user_id`(UUID) を控える。

### 2. 環境変数（`.env.local` をコピーして設定）
`.env.example` 参照。
- フロント: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- 関数のみ（ブラウザに出さない）: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `ALLOWED_USER_IDS`(許可UUIDをカンマ区切り), `MONTHLY_OCR_LIMIT`, `OCR_MODEL`(任意・OCRモデルをオーナー固定。未設定なら最安haiku)

### 3. ローカル起動
```bash
npm install
npm run dev      # フロント
npm run lint     # tsc --noEmit
```
※ `npm run dev` は `/api/ocr` を起動しない。OCR まで通すなら `vercel dev`（Vercel CLI）を使う。

### 4. デプロイ（Vercel）
- New Project → このリポジトリ → **Root Directory = `web`** に設定。
- 上記の環境変数を Vercel に登録（`VITE_*` 以外はビルド時に露出しない）。
- push で自動デプロイ（中心銘と同じフロー）。

## 現状（マイルストーン）
- M0 認証ゲート / 足場 … 実装済
- M1 1枚OCR縦切り（Storageアップ→/api/ocr→Vision→ルール→status→update→usage）… 実装済
- M2 CRUD（supabase-js直 + RLS）… 実装済。**Settingsのキー入力UI撤去・完了**（Web版は鍵をサーバー保持のため。Inbox/ReceiptListの`hasApiKey`死に分岐も除去）
- 提供形態 **Model 1**（オーナーが1組のSupabase＋Anthropicキーを保持し招待制でクライアントに相乗り提供。OCR代はオーナー負担）。**OCRモデルは `OCR_MODEL` でオーナー固定**（クライアントは選べない）
- M3 複数枚・進捗・コスト上限 … 取込は並列度3・月次上限あり。孤児ファイル掃除も実装済（取込でアップ後にDB行作成が失敗／部分アップ時、アップ済みStorageファイルを掃除して孤児を残さない。発生源で防ぐ方式＝破壊的スイープは原本誤削除リスクのため不採用）
- **M4 エクスポート（CSV/Excel/PDF/ZIP）… 未実装**（`api.ts` の `exportData` は準備中エラーを返す）

## iPad の注意
- ファイル取込は `<input type="file">`（カメラ/ファイル選択）。D&D はPCのみ。
- ダウンロードは「ファイルアプリに保存」になる。
- `pdfjs` worker の iOS Safari 実機動作は要確認。
