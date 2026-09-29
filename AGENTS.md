# AGENTS.md — dsh-workspace-group-plugin

> 本文件面向在本仓库工作的 AI Agent 与开发者，描述项目定位、结构、机制与开发/验证约定。

## 项目概述

- **插件名**：`@local/workspace-group-manager`（v1.0.0，private，ESM，双面插件）
- **目录名**：`dsh-workspace-group-plugin`（与包名不同属有意为之，勿混用）
- **定位**：DSH Web 客户端插件，在侧边栏工作区位置以自定义分组展示工作目录（原地遮蔽官方浏览区，一键切回官方视图）
- **核心能力**：
  - 分组视图遮蔽注册（`sidebar.workspaces` single 槽，priority -1；官方条目保持注册，释放即恢复）；模式切换在设置面板的「工作区视图」section（`settings.section`，order 65，参考 mcp 插件），经 `wsg.sidebarMode.change` DOM 事件驱动 index.tsx 热重挂侧栏注册（立即生效，无重载）；模式存 localStorage `wsg.sidebarMode`
  - 分组 → 工作目录 → 会话 三层树；目录可属多分组；未分配目录进「未分组」虚拟区；视图选项（分组方式/排序/归档筛选）持久化到 localStorage `wsg.view.v1`
  - 点击会话经 `ctx.uiWorkspace.openSession` 跳转对话；「+」经 `startSession(workspaceId)` 开新会话；会话置顶/重命名/分叉/归档走 `ctx.uiWorkspace` + `ctx.sessions` + `ctx.workspaces`
  - 目录行指针拖拽（分组归属与顺序）、分组头原生拖拽排序；分组数据经宿主 `/workspace-group-manager/*` 路由持久化到 `<DSH home>/workspace-groups.json`
- **形态**：host 半边（纯 JS，免构建）+ 浏览器半边（TSX，esbuild 打包）

## 仓库结构

| 文件 | 性质 | 说明 |
| --- | --- | --- |
| `package.json` | 手写 | 双面清单：exports `"."`/`"./client"`、`dsh.bundle.patch`、`dsh.client` |
| `cordis.patch.yml` | 手写 | bundle 补丁：插入 `id: workspace-group-manager` 行 |
| `pnpm-workspace.yaml` | 手写 | `allowBuilds: esbuild`；`autoInstallPeers: false`（peer 仅作引擎声明，自动安装会拖入 DSH 整棵原生依赖树且触发 ignored-builds 报错） |
| `build.mjs` | 手写 | esbuild 打包 client，banner/footer 生成 `__ModuleLoader__` 工厂包裹 |
| `src/host/*.js` | 手写 | 宿主半边：路由 / JSON 存储 / 回环栅栏 |
| `src/client/*` | 手写 | 浏览器半边 TSX：侧栏分组视图（官方类名 + 官方图标）/ 拖拽矩阵 / 词典 / API |
| `lib/client.js` | **构建产物** | 由 build.mjs 生成，勿手改 |
| `test/*.test.mjs` | 手写 | node:test 单测（store / routes / loopback / group-move，后者的 TS 经 `--experimental-strip-types` 直测） |

## 机制速查（修改前必读）

- **遮蔽注册链**：`slots.inject('sidebar.workspaces', () => slots.register({ name:'sidebar.workspaces', priority:-1, locale:NS, inject:()=>({wsg}) }, GroupedRegion))`。同 priority 注册会抛错、不同 priority 低者渲染（shadowing），官方浏览器条目保持注册，释放本注册即原样恢复。模式切换由设置 section 派发 `wsg.sidebarMode.change` DOM 事件，驱动 `applySidebarMode()` 释放/重建本注册（立即生效，无重载）。注入面 `wsg = { api, nav, ws }` 绑定自 `ctx.inject(['slots','uiWorkspace','workspaces','sessions'], …)`。
- **全局钩子即 props**：`useWorkspaces`（ui-workspace 合并入 GlobalStandardProps）与 `useSessions`（ui-session）会作为全局席位 props 传给每个 slot 组件；视图据此取 `items`（`WorkspaceView{workspaceId,path,title,sessionIds,updatedAt}`）、`archivedSessionIds`、`pinnedSessionIds` 与 `byId`（`SessionSummary{displayTitle,running,blank,updatedAt,origin?}`）。不得自行 import DSH 运行时包——客户端一律结构化类型 + `ctx.inject(['slots','uiWorkspace','workspaces','sessions'], …)`。
- **成员按路径不按 id**：分组存 canonical workspace path；工作区删除重注册后 id 变、路径不变。渲染时以 `useWorkspaces` 的 items 映射，映射失败显示「未注册」置灰行。
- **会话行过滤**：隐藏 archived（registry 全局集合）、blank（临时空白新会话）、`origin === 'subagent'`；按 `updatedAt` 降序。运行状态点直接读 `summary.running`。
- **存储铁律**：`store.js` 载入时容忍损坏——改名 `*.bak-<ts>` 后空启动并在 list 响应带 notice；所有变更走进程内 promise 队列串行 read-modify-write，temp+rename 原子替换；校验：title ≤100 非空、path ≤1024 非空去重、分组 ≤100、每组成员 ≤200。
- **HTTP 面**：`/workspace-group-manager` 前缀路由，回环栅栏（loopback.js，自包含移植）先行，JSON envelope `{ok,value}|{ok:false,error:{code,message}}`，body 上限 64KB；客户端 fetch 用**文档相对路径**（无前导斜杠）。
- **样式纪律**：侧栏视图直接使用**官方 CSS 类名**（`ROWS`/`SHELL` 常量 = ui-workspace CSS-module 哈希，已核对 0.1.7-rc.2 与 0.2.0-rc.1 完全一致——官方浏览器条目保持注册，其 `<style>` 标签持续在页面中，故这些类始终生效）+ **官方 primitives 组件**（图标/`Menu`/`Tooltip`，经 `window.__wsgRequire` 解析——build.mjs footer 从 loader 的 `require` 注入）。图标名必须是带变体后缀的导出（如 `IconPlusOutlineRegular`，裸名是 artwork 令牌、不是组件）。菜单用官方 `Menu`（portal），无自绘 portal。
- **搜索**：区头 🔍 展开内联输入，250ms 防抖调 `sessions.search(query, signal)`（RemoteResult 需自行解包 `{ok,value}`），结果按 `byId` 联结会话摘要、按归档筛选过滤，点击打开（已归档提示）。当前会话高亮：`selected` 类 + `folderActive`，判定 = `retainedBy.mainView > 0` 且 `usePanelInfo.activePanelId == null`。
- **拖拽纪律**：**目录行 = 指针拖拽**（`onDirRowMouseDown` → 5px 阈值 → `elementFromPoint` 命中 `[data-wsg-drop]` 行/头 → mouseup 提交；拖拽值从 `dataTransfer.getData` 读取，**不依赖 React 拖拽状态**，状态仅做半透明/标记的视觉反馈）；**分组头 = 原生 HTML5 drag**（实测可靠）。落点为目录行时经 `data-wsg-owner` 定源分组，落点为分组头时按上/下半插入。目录行的放置线是注入 CSS（官方只给 sessionRow 定义了 dropBefore/dropAfter）。
- **pnpm 配置**：`autoInstallPeers: false` 写在 pnpm-workspace.yaml（pnpm 11 不读项目 .npmrc 的该键）；peer `@deepseek-ai/dsh` 仅作兼容性声明，宿主运行时由 DSH 自身提供。

## 开发循环

```bash
pnpm install        # 干净安装（esbuild 已 allowBuilds）
pnpm run typecheck  # tsc --noEmit（client TSX，strict）
pnpm test           # node --test --experimental-strip-types（group-move.ts 直测）
pnpm run build      # 产出 lib/client.js
```

- 插件以 `link:` 方式装在 web profile（`~/.dsh/profiles/web/package.json` 的 dependencies + `dsh.profile.bundles`，或 `dsh plugin --profile web add link:<目录>`），pnpm install 后生效；**bundle 名单变更需要重启 DSH**，已安装状态下改 host 半边即时生效、改 client 半边需重新 build + 刷新页面。

## 验证（完成前必做）

1. `node --check src/host/*.js` + `pnpm run typecheck && pnpm test && pnpm run build` 全部实际执行并确认输出；
2. 存储层改动后 `test/store.test.mjs` 的「未触及语义」断言（幂等成员、损坏备份、并发串行）必须全绿；
3. GUI 手动验收：分组视图遮蔽官方列表；区头「＋」新建分组 → 「未分组」「⋯」添加目录 → 展开会话、点击跳转、「+」新会话、置顶/分叉/归档 → 重命名/移动/移出/删除 → **拖拽：目录行拖到他组头/未分组头/其他目录行上/下半（蓝线标记），分组头拖动排序** → 视图选项四种分组方式/两种排序/三档归档筛选 → 设置 → 工作区视图 切换 官方/分组（立即生效、官方列表原样恢复）→ 刷新页面数据仍在 → 中英文案正确；
4. 检查 `<DSH home>/workspace-groups.json` 内容与 UI 一致。

## 已知边界

- 分组模式下官方浏览器被遮蔽（设置 → 工作区视图 一键切回）；官方类名哈希与行结构已按 0.2.0-rc.1 校准（与 0.1.7-rc.2 一致），升级需复核；悬停卡片未实现。
- 数据为本机全局一份（不分 profile）；多标签并发写 last-write-wins。
- 路由仅回环可用（与 mcp 插件同款栅栏），远程浏览器部署不可管理分组。
