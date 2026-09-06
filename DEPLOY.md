# 部署大富翁

本作有**两个版本**，部署方式不同：

## A. 单机版（纯前端，已部署到 Netlify）
- 文件：`dist/index.html`（打包成**单个自包含文件**）。
- 玩法：一台电脑，真人轮流 + AI。不需要服务器。
- 部署：拖到 **app.netlify.com/drop** + 注册免费账号 → 得到 `xxx.netlify.app` 永久网址。
- ✅ 你现在已经完成了这个（`resplendent-cassata-6039c0.netlify.app`）。

## B. 联机版（房间号回合制，需要后端服务器）
- 后端：`server.js`（Node/Express），负责建房、房间号、加入、回合同步、持久化、AI。
- 前端：`index.html` / `style.css` / `game.js`（双模式：单机 / 联机，联机走 API）。
- 玩法：一个人创建房间得到**房间号**，朋友输入房间号加入，大家看到**同一盘棋**，轮流操作，数据自动保存。

> 联机版必须跑在一个能执行 Node 的宿主上（Netlify 免费静态托管不支持）。推荐 **Render**（免费、可长期固定域名），步骤和 Netlify 类似，但需要通过 GitHub 仓库部署。

### 联机版部署到 Render（约 5 分钟）
1. **上传到 GitHub**（只要这次联机版，别传 node_modules）：
   - 需要文件：`index.html`、`style.css`、`game.js`、`server.js`、`app.js`、`package.json`、`render.yaml`、`.gitignore`、`src/` 文件夹。
   - github.com → New repository（公开）→ Add file → Upload files → 把这些拖进去 → Commit。
2. **注册 Render**：render.com → 用 GitHub 登录（免费）→ **New → Web Service**。
3. **连接仓库**：选你刚才上传的 GitHub 仓库。
4. **保持默认**：Render 会自动读 `render.yaml`（构建 `npm install --omit=dev`、启动 `node server.js`）。若没自动读，手动填：
   - Build Command：`npm install --omit=dev`
   - Start Command：`node server.js`
5. **Deploy** → 得到永久网址 `https://项目名.onrender.com`。
6. 把这个网址发给朋友——大家在同一个网址里：一人**创建房间**得房间号，其他人**加入房间**输入房间号，即可同玩一盘。

> 提醒：Render 免费版服务闲置约 15 分钟会休眠，有人访问时自动唤醒（首次稍慢）；对休闲游玩足够。要更稳定可升级付费。

### 说明
- Render 免费版把游戏数据存在实例本地磁盘，重启会清空房间；对"即开即玩"的休闲场景无影响。
- 单机版（Netlify）和联机版（Render）是两个独立入口，可同时用。
