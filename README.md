# Classroom Battle Online (联机网页成品 V0)

这是基于你提供的核心逻辑做的 **可运行联机网站原型**（Socket.io + Phaser）：
- 房间联机：服务器权威状态同步
- 回合流程：LOBBY → PLANNING → ACTION → QUIZ → SOLVE → SETTLE → GROWTH → RESOURCE（RESOURCE 后回到 PLANNING，最多 6 回合）
- ✅ **出题方扣除自身属性**：出题时立即扣除逻辑/记忆（X/Y = 题目难度）
- ✅ **解题方扣除自身属性**：主解题者解题时立即扣除逻辑/记忆（投入），并按“参与人数”获得 +1/+1 协助加成
- ✅ 压力>=9 自动回家（HOME）

> 你要求的“留接口可改规则、可引入角色/技能、可引入地图 SVG”都已预留：规则/地图/角色均为独立配置文件，技能通过 hooks 扩展。

## 运行

### 1) 启动服务端
```bash
cd server
npm i
npm run dev
```
服务端：`http://localhost:3001`

### 2) 启动前端
```bash
cd client
npm i
npm run dev
```
前端：`http://localhost:5173`

打开两个浏览器窗口，输入同一房间号即可联机。

---

## 扩展接口（你后续要接的内容）

### A) 地图 SVG
- 替换：`client/src/assets/map.svg`
- 桌子区域与容量：`server/src/config/map.js` 的 `tables[].rect/capacity/ownerTeam`
  - **table id 必须稳定**（前后端都用它）

### B) 规则改动
- `server/src/config/rules.js`
  - 最大轨迹数、压力上限、解题得分、压力增减、资源产出等都在这里

### C) 角色与技能
- 角色表：`server/src/config/roles.js`（后续你可换 JSON 读取）
- 技能实现：`server/src/state.js` 的 `hooks`
  - `onBeforeMove/onAfterMove`
  - `onBeforeAsk/onAfterAsk`
  - `onBeforeSolve/onAfterSolve`

### D) 出题/解题核心算法
- `server/src/rules/quiz_solve.js`
  - `canAskOnTable`：谁能出题（你文档里的限制规则可在此实现）
  - `resolveAttempt`：成功判定与结算（你要的“消耗属性值出题/解题”就在这条链路里）

---

## 部署说明（你要“联机网站给我”的现实做法）
我无法替你把代码直接部署到公网域名，但这个项目已经是“可部署”的形态：
- 你把它放到 VPS 上：
  - server 用 PM2/Node 常驻
  - client 用 Nginx/静态托管，或直接 `vite preview --host`
- 我也可以继续帮你补：
  - Nginx 配置
  - HTTPS（Let’s Encrypt）
  - 反向代理与跨域
  - 持久化存储（Redis）



## Domain-ready support (added)
- Client socket endpoint is configurable via `VITE_SOCKET_URL`.
- Server supports `PORT/HOST/CORS_ORIGINS` env vars.
- Deploy templates: see `deploy/`.
