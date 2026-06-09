# Quick Obsidian

スマホから **Markdownメモを素早くObsidian Vaultに保存** するための、軽量・シンプルなPWA（Webアプリ）です。
ビルド不要の静的ファイルのみ。メモは **Cloudflare R2**（Obsidianの **Remotely Save** プラグインの同期先）へ直接保存され、次回の同期でObsidianに取り込まれます。

```
[スマホのアプリ] --(S3 API / 直接保存)--> [Cloudflare R2] --(Remotely Save 同期)--> [Obsidian]
```

## 特長

- 📝 起動即メモ入力（本文にオートフォーカス、`Ctrl/Cmd+Enter` で保存）
- 🆕 **新規ノート** と 🗓️ **デイリーノートへ追記** の2モード
- 📲 PWA対応：ホーム画面に追加してネイティブアプリのように使用
- ✈️ オフライン対応：圏外でも下書きを保持し、オンライン復帰時に自動送信
- 🔒 個人用：Basic認証で他人の利用を防止。R2のキーは端末内 (`localStorage`) にのみ保存
- 🪶 SDK不要：S3署名(SigV4)はブラウザのWeb Cryptoで実装。依存ライブラリゼロ

---

## 前提（重要）

- このアプリは Remotely Save の同期先である **Cloudflare R2 に平文の `.md` を直接書き込みます**。
  そのため Remotely Save の **エンドツーエンド暗号化はオフ**（パスワード未設定）である必要があります。
  暗号化を使っている場合、このアプリの保存内容はObsidianから正しく読めません。
- 保存したメモは、Obsidian側で **Remotely Save の同期（Start sync）が走ったタイミング** で表示されます。
  PCは自動同期、スマホのObsidianはアプリ起動時/手動同期が基本です。

---

## セットアップ

### 1. ホスティング（Xserver）

専用アドレス（例 `https://quickob.example.com/`、またはサブディレクトリ `…/quickob/`）に、
このリポジトリのファイル一式をアップロードします。

1. Xserver で対象ドメイン/サブドメインを用意し、**無料独自SSL** を有効化（HTTPS必須）
2. ファイルを公開ディレクトリ（例 `public_html/quickob/`）へアップロード
   - サーバーパネルの **ファイルマネージャ**、または FTP/SFTP クライアントで
   - 繰り返しデプロイするなら同梱の `deploy.sh.example` を `deploy.sh` にコピーして使用（lftp使用、SFTPポートは通常 `10022`）
3. **Basic認証で保護**（初回のみログイン必須にする）
   - **推奨**：サーバーパネル →「アクセス制限」で対象フォルダを ON にし、ユーザー名・パスワードを設定（`.htaccess`/`.htpasswd` 自動生成）
   - 手動設定派は同梱 `.htaccess` 内のコメント手順を参照
4. `https://（あなたの専用アドレス）/` を開いて表示確認

> 同梱の `.htaccess` がHTTPS強制・正しいMIME・Service Workerのキャッシュ制御を行います。
> ローカル確認は `python3 -m http.server 8080` でも可。**HTTPSまたはlocalhostでのみ** Service Worker が動作します。

### 2. R2 の接続情報を用意

Remotely Save 設定で使っているものと同じ情報です（同期ガイドの STEP 1 で控えたもの）:

- **S3 API Endpoint**（`https://〜.r2.cloudflarestorage.com`）
- **Access Key ID**
- **Secret Access Key**
- **バケット名**（例 `obsidian-vault`）

> セキュリティ上は、Admin 権限のキーではなく、**対象バケットのみ／Object Read & Write** に絞った
> R2 API トークンを別途発行して使うのがより安全です（このアプリにはそれで十分動きます）。

### 3. R2 バケットに CORS を設定（必須）

ブラウザからR2へ直接書き込むため、バケットに **CORS** 許可が必要です。設定しないと保存・接続テストが失敗します。

Cloudflareダッシュボード → R2 → 対象バケット → **設定 (Settings)** → **CORS Policy** に以下を貼り付け、
`AllowedOrigins` を **あなたの公開アドレス** に置き換えてください。

```json
[
  {
    "AllowedOrigins": ["https://quickob.example.com"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

> サブディレクトリ運用でも `AllowedOrigins` は **オリジン（スキーム＋ホスト）** まで。パスは含めません。

### 4. アプリを設定

公開URLを開き、右上の ⚙️ から:

| 項目 | 例 | 説明 |
|---|---|---|
| S3 API Endpoint | `https://xxxx.r2.cloudflarestorage.com` | R2のS3 APIエンドポイント（バケット名は含めない） |
| バケット名 | `obsidian-vault` | Remotely Save と同じバケット |
| Access Key ID | `…` | R2 アクセスキーID |
| Secret Access Key | `…` | R2 シークレットキー |
| リモートのプレフィックス | （通常空欄） | Remotely Saveで「リモートの基準フォルダ」を設定している場合のみ |
| 新規ノートの保存フォルダ | `Inbox` | Vault内の相対パス（空ならルート） |
| デイリーノートのパス書式 | `Daily/YYYY-MM-DD.md` | `YYYY MM DD HH mm` が置換される |

「接続テスト」で疎通を確認し、「保存」。

### 5. ホーム画面に追加

- **iOS (Safari)**: 共有 → 「ホーム画面に追加」
- **Android (Chrome)**: メニュー → 「アプリをインストール」

---

## 使い方

- **新規ノート**: タイトル（任意）＋本文を書いて保存。`<フォルダ>/<タイトル>.md` が作成されます。
  タイトル省略時はファイル名が日時（例 `2026-06-09 1530.md`）になり、`created` フロントマターが付きます。
  同名があれば自動で連番（`-1`, `-2`…）を付けて上書きを防ぎます。
- **デイリーに追記**: 本文を書いて保存すると、当日のデイリーノート（無ければ新規作成）に追記されます。
  設定で時刻見出し `- HH:mm` の自動付与を切り替えられます。

保存後、Obsidian側で Remotely Save の同期が走るとメモが反映されます。

> 追記モードは既存ファイルを書き換えるため、同じデイリーノートをPC側でも同時編集していると
> Remotely Save が競合コピーを作る可能性があります。確実なのは新規ノートモードです。

---

## 保存先・データの扱い

- メモは S3 API（SigV4署名）で **R2に直接保存** されます。ホスティングのサーバーはメモ内容を保持しません。
- R2のキーと下書きはブラウザの `localStorage` にのみ保存されます。共有端末では使用後にキーを消去してください。
- アプリ自体は Basic 認証で保護され、第三者の利用を防ぎます。

## ファイル構成

```
index.html              画面構成
css/styles.css          スタイル
js/s3.js                Cloudflare R2 (S3互換) クライアント / SigV4署名
js/app.js               入力UI・設定・オフラインキュー
manifest.webmanifest    PWAマニフェスト
sw.js                   Service Worker（アプリシェルのオフラインキャッシュ）
icons/                  アイコン（generate_icons.py で再生成可能）
.htaccess               HTTPS強制・MIME・キャッシュ・Basic認証(任意)
deploy.sh.example       Xserver へ SFTP デプロイする雛形（任意）
```

## トラブルシューティング

- **接続テストで「通信失敗（CORS未設定の可能性大）」** → 手順3のCORSを設定。`AllowedOrigins` が公開アドレスと完全一致（`https://`含む）か確認。
- **「認証エラー」** → Access Key / Secret を再確認。R2 API トークンの権限が Read & Write か確認。
- **保存できたのにObsidianに出ない** → Obsidianで Remotely Save の **Start sync** を実行。出ない場合は設定下部の **Reset Last Successful Sync Time** 後に再同期。
- **メモが文字化け/暗号化されて見える** → Remotely Save の暗号化がオンになっています。前提のとおりオフにしてください。
