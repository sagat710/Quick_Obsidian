# Quick Obsidian

スマホから **Markdownメモを素早くObsidian Vaultに保存** するための、軽量・シンプルなPWA（Webアプリ）です。
ビルド不要の静的ファイルのみ。メモはGitHub API経由でVaultリポジトリに直接コミットされ、`obsidian-git` などでVaultに同期されます。

```
[スマホのブラウザ/ホーム画面アプリ] --(GitHub API)--> [Vaultリポジトリ] --(obsidian-git)--> [Obsidian]
```

## 特長

- 📝 起動即メモ入力（本文にオートフォーカス、`Ctrl/Cmd+Enter` で保存）
- 🆕 **新規ノート** と 🗓️ **デイリーノートへ追記** の2モード
- 📲 PWA対応：ホーム画面に追加してネイティブアプリのように使用
- ✈️ オフライン対応：圏外でも下書きを保持し、オンライン復帰時に自動送信
- 🔒 サーバー不要。GitHubトークンは端末内 (`localStorage`) にのみ保存

---

## セットアップ

### 1. ホスティング（GitHub Pages）

このリポジトリの **Settings → Pages** で、Source を「GitHub Actions」にすると、
`main` への push 時に自動でデプロイされます（`.github/workflows/pages.yml` 同梱）。

数十秒後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます。

> 静的ファイルだけなので、Netlify / Cloudflare Pages / Vercel などにそのまま置いても動きます。
> ローカル確認は `python3 -m http.server 8080` でも可。**HTTPSまたはlocalhostでのみ** Service Worker が動作します。

### 2. GitHub トークンを作成

メモを書き込む権限を持つ Fine-grained Personal Access Token を作成します。

1. GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token
2. **Repository access**: Vaultのリポジトリのみを選択
3. **Permissions** → Repository permissions → **Contents** を **Read and write** に
4. 生成された `github_pat_…` をコピー

> Contents 権限のみで動きます。他の権限は不要です。漏洩時の影響を最小化するため、用途を絞ったトークンを推奨します。

### 3. アプリを設定

公開URLを開き、右上の ⚙️ から:

| 項目 | 例 | 説明 |
|---|---|---|
| GitHub トークン | `github_pat_…` | 上で作成したPAT |
| リポジトリ | `yourname/my-vault` | Vaultのリポジトリ (`owner/repo`) |
| ブランチ | `main` | コミット先ブランチ |
| 新規ノートの保存フォルダ | `Inbox` | Vault内の相対パス（空ならルート） |
| デイリーノートのパス書式 | `Daily/YYYY-MM-DD.md` | `YYYY MM DD HH mm` が置換される |

「接続テスト」で疎通を確認し、「保存」。

### 4. ホーム画面に追加

- **iOS (Safari)**: 共有 → 「ホーム画面に追加」
- **Android (Chrome)**: メニュー → 「アプリをインストール」

---

## 使い方

- **新規ノート**: タイトル（任意）＋本文を書いて保存。`<フォルダ>/<タイトル>.md` が作成されます。
  タイトル省略時はファイル名が日時（例 `2026-06-09 1530.md`）になり、`created` フロントマターが付きます。
- **デイリーに追記**: 本文を書いて保存すると、当日のデイリーノート（無ければ新規作成）に追記されます。
  設定で時刻見出し `- HH:mm` の自動付与を切り替えられます。

保存されたメモは次回のVault同期でObsidianに反映されます。

---

## 保存先・データの扱い

- メモは GitHub Contents API でリポジトリにコミットされます（外部サーバーを一切経由しません）。
- トークンと下書きはブラウザの `localStorage` にのみ保存されます。共有端末では使用後にトークンを消去してください。

## ファイル構成

```
index.html              画面構成
css/styles.css          スタイル
js/github.js            GitHub Contents API クライアント
js/app.js               入力UI・設定・オフラインキュー
manifest.webmanifest    PWAマニフェスト
sw.js                   Service Worker（アプリシェルのオフラインキャッシュ）
icons/                  アイコン（generate_icons.py で再生成可能）
.github/workflows/      GitHub Pages 自動デプロイ
```
