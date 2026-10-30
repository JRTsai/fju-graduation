# 畢業光影｜輔仁大學統計資訊學系暨碩士班

畢業典禮用的照片與祝福即時牆：手機拍照上傳、留言，大螢幕即時顯示。

- 新照片一上傳，所有螢幕立刻放大顯示 10 秒（標示「✦ 剛剛上傳」），之後自動回到全部照片輪播（每 6 秒一張）
- 點選下方縮圖或主畫面可觀看該張照片，閒置 10 秒後回到輪播
- 留言區每 7 秒輪播一則祝福
- 「大螢幕模式」會全螢幕顯示並在右側出現 QR Code，讓現場同學掃描上傳

純靜態網頁（HTML/CSS/JS），放在 GitHub Pages；照片與留言存在 Supabase（免費方案即可）。

## 1. 建立 Supabase（約 5 分鐘）

1. 到 https://supabase.com 註冊並 **New project**（Region 選 Northeast Asia (Tokyo) 或 Singapore）。
2. 左側 **SQL Editor** → 貼上 `supabase-setup.sql` 全部內容 → **Run**。
3. **Project Settings → API Keys**：複製 Project URL 與 publishable（或 anon）key。
4. 填入 `config.js`：
   ```js
   supabaseUrl: 'https://xxxx.supabase.co',
   supabaseKey: 'sb_publishable_...（或 eyJ... 開頭的 anon key）',
   ```
   這把 key 本來就是給前端公開使用的；**絕對不要**填 secret / service_role key。

未填設定時網頁以「示範模式」執行，可以預覽但資料不會共享。

## 2. 發布到 GitHub Pages

1. 在 GitHub 建立公開 repository `fju-graduation`（不要勾選新增 README）。
2. 推送本資料夾後，到 repo **Settings → Pages → Build and deployment**：Source 選 *Deploy from a branch*、Branch 選 `main` / `(root)`。
3. 約 1 分鐘後網址為：https://jrtsai.github.io/fju-graduation/

## 管理留言與照片

不當內容請在 Supabase **Table Editor → posts** 刪除該列（所有螢幕會即時移除），照片檔可在 **Storage → photos** 刪除。

典禮結束後，可在 Supabase 刪除 `posts insert` 與 `photos upload` 兩條 policy 以停止收件，既有內容仍可瀏覽。
