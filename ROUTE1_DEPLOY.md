# 路线1：不买域名/不买服务器，直接分享给好友（Vercel + Render）

目标：
- 你发给好友一个链接（Vercel）：https://xxx.vercel.app
- 好友点开就能进房间联机（Socket.io 服务跑在 Render）：https://xxx.onrender.com

> 这是最省事的方案：你只需要 GitHub 账号（免费）。

---

## 0. 准备
1) 解压本项目
2) 用 GitHub 创建一个新仓库（Repo），把整个文件夹上传进去（包含 server/ client/ render.yaml）

---

## 1) 部署后端（Render）
1) 打开 Render（Create a new Web Service）
2) 选择 “Blueprint”/“Deploy from render.yaml”（如果你看到该选项，就直接用它）
   - Render 会自动识别根目录的 `render.yaml` 并部署 `server/`
3) 部署完成后你会得到一个后端地址，例如：
   - https://classroom-battle-server.onrender.com

4) 打开该地址的健康检查：
   - https://xxx.onrender.com/health
   应该返回 `{ ok: true }`

> 注意：
> - Render 免费档可能有“冷启动”（几分钟没访问，第一次会慢几秒）

---

## 2) 部署前端（Vercel）
1) 打开 Vercel → New Project → 选你的 GitHub 仓库
2) **Root Directory 选择 `client/`**
3) 在 Vercel 的 Environment Variables 里添加：
   - Key: `VITE_SOCKET_URL`
   - Value: 你刚才的 Render 地址（不要带尾部斜杠），例如：
     `https://classroom-battle-server.onrender.com`
4) 点击 Deploy

部署完成后你会得到前端地址，例如：
- https://classroom-battle.vercel.app

---

## 3) 试玩联机（你发给好友的就是这个链接）
1) 你先打开 Vercel 链接
2) 让好友也打开同一个 Vercel 链接
3) 两个人输入同一个房间号（例如 room1）
4) 选队伍 A/B → START → 就能看到同步

---

## 4) 常见坑（最常见两个）
### A) “连不上服务器 / websocket failed”
- 检查 Vercel 环境变量 `VITE_SOCKET_URL` 是否填对（必须是 Render 的 https 地址）
- Render 服务是否睡眠：打开 `https://xxx.onrender.com/health` 先唤醒

### B) “跨域 CORS 报错”
- 你可以先用 `CORS_ORIGINS="*"`（本项目默认就是）
- 如果你想更安全：
  - 在 Render 的 Environment 里把 `CORS_ORIGINS` 改成你的 Vercel 域名：
    `https://xxx.vercel.app`

---

## 你以后怎么改规则/地图/角色
- 改规则：`server/src/config/rules.js`
- 改地图桌子区域：`server/src/config/map.js`
- 换 SVG：`client/src/assets/map.svg`
- 加角色/技能：`server/src/config/roles.js` + `server/src/state.js` hooks

改完推送到 GitHub 后：
- Vercel 会自动重新部署前端
- Render 也会自动重新部署后端（或你点一下 Manual Deploy）

