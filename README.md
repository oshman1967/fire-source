# Trend Fire Source — デプロイ手順

## 事前準備は完了済み
- 全11ファイル(index.html含む)はフラット構成、相対パスのみでリンクし合っているので、フォルダごとそのままでOK
- index.htmlはトップページ(trend_fire_source_top.html)へ自動リダイレクト

## 手順(所要5分程度)

1. GitHubで新規リポジトリを作成(例: oshman1967/fire-source)
2. このフォルダの中身を全てリポジトリにアップロード
   - GitHub Web UIの「Add file → Upload files」にこのzipの中身をドラッグ&ドロップでOK(ビルド不要の静的サイトなので)
3. https://vercel.com → 「Add New → Project」→ 今作ったリポジトリを選択してImport
4. Framework Presetは「Other」のままでOK(ビルドコマンド不要)、そのまま Deploy
5. 数十秒でデプロイ完了、発行されたURL(例: fire-source.vercel.app)がそのまま本番URL

## ページ構成・導線
トップ → 無料診断入力 → 診断レポート → データ分析プランLP → 相談フォーム → プラン選択(A/B) → 完了ページ / Plan B申込フォーム → 申込完了
