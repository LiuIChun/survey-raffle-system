# 問卷抽獎系統 (Survey Raffle System)

多人即時同步的問卷抽獎系統。純靜態前端，使用 Firebase (Anonymous Auth + Firestore) 同步資料，無需自建後端或建置工具。

## 功能
- 多人即時同步（參與者、獎項、中獎紀錄）
- CSV 匯入問卷名單
- 獎項管理、抽獎流程（含音效與彩帶動畫）
- 中獎結果匯出
- 隱私遮罩、Toast / Modal 提示

## 專案結構
```
index.html              頁面結構（HTML）
css/styles.css          自訂樣式
js/tailwind-config.js   Tailwind CDN 設定
js/config.js            Firebase 設定（請修改此檔）
js/firebase-sync.js     Firebase 初始化與即時同步 (ES module)
js/app.js               UI 與抽獎流程邏輯
404.html                GitHub Pages 404 頁
.nojekyll               停用 Jekyll 處理
.github/workflows/pages.yml  GitHub Pages 自動部署
```

## 設定 Firebase
1. 到 [Firebase Console](https://console.firebase.google.com/) 建立專案，新增 Web App。
2. 啟用 **Authentication → Sign-in method → Anonymous**。
3. 建立 **Firestore Database**，並設定規則，允許已登入使用者讀寫 `artifacts/{appId}/public/data/**`：
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /artifacts/{appId}/public/data/{document=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```
4. 將 Web App 設定貼入 `js/config.js` 的 `firebaseConfig`（可同時調整 `appId`，不同 `appId` 代表不同的資料空間）。
5. 在 Authentication → Settings → Authorized domains 加入你的 GitHub Pages 網域（`<user>.github.io`）。

> 若執行環境提供全域變數 `__firebase_config`（JSON 字串）與 `__app_id`，則優先使用它們。

## 本機執行
ES module 需透過 HTTP 提供，請勿直接以 `file://` 開啟：
```
python3 -m http.server 8000
```
然後開啟 http://localhost:8000。

## 部署到 GitHub Pages
- **方式 A（建議）**：Settings → Pages → Source 選擇 **GitHub Actions**，推送到 `main` 即由 `.github/workflows/pages.yml` 自動部署。
- **方式 B**：Settings → Pages → Source 選擇 **Deploy from a branch**，Branch 選 `main`、資料夾 `/ (root)`。

部署後網址為 `https://<user>.github.io/survey-raffle-system/`。
