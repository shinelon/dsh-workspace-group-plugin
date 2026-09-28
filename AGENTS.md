# AGENTS.md — dsh-workspace-group-plugin

> 本文件面向在本仓库工作的 AI Agent 与开发者，描述项目定位、结构、机制与开发/验证约定。

## 项目概述

- **插件名**：`@local/workspace-group-manager`（v1.0.0，private，ESM，双面插件）
- **目录名**：`dsh-workspace-group-plugin`（与包名不同属有意为之，勿混用）
- **定位**：DSH Web 客户端的「分组」主面板插件，把工作目录组织成自定义分组
- **核心能力**：
  - 侧边栏面板图标（`sidebar.panellist` list 槽，id `workspace-groups`，order 20）+ 主面板页面（`main` keyed 槽，key 同 id）——与内置 schedule / plugin-manager 面板同款注册形态
  - 分组 → 工作目录 → 会话 三层树；目录可属多分组；未分配目录进「未分组」虚拟区
  - 点击会话经 `ctx.uiWorkspace.openSession` 跳转对话；「+」经 `startSession(workspaceId)` 开新会话
  - 分组数据经宿主 `/workspace-group-manager/*` 路由持久化到 `<DSH home>/workspace-groups.json`
- **形态**：host 半边（纯 JS，免构建）+ 浏览器半边（TSX，esbuild 打包）

## 仓库结构

| 文件 | 性质 | 说明 |
| --- | --- | --- |
| `package.json` | 手写 | 双面清单：exports `"."`/`"./client"`、`dsh.bundle.patch`、`dsh.client` |
| `cordis.patch.yml` | 手写 | bundle 补丁：插入 `id: workspace-group-manager` 行 |
| `pnpm-workspace.yaml` | 手写 | `allowBuilds: esbuild`；`autoInstallPeers: false`（peer 仅作引擎声明，自动安装会拖入 DSH 整棵原生依赖树且触发 ignored-builds 报错） |
| `build.mjs` | 手写 | esbuild 打包 client，banner/footer 生成 `__ModuleLoader__` 工厂包裹 |
| `src/host/*.js` | 手写 | 宿主半边：路由 / JSON 存储 / 回环栅栏 |
| `src/client/*` | 手写 | 浏览器半边 TSX：面板 / 菜单 / 拖拽矩阵 / 词典 / API |
| `lib/client.js` | **构建产物** | 由 build.mjs 生成，勿手改 |
| `test/*.test.mjs` | 手写 | node:test 单测（store / routes / loopback / group-move，后者的 TS 经 `--experimental-strip-types` 直测） |

## 机制速查（修改前必读）

- **面板注册链**：`slots.inject('main', …slots.register({name:'main', key:PANEL_ID, locale:NS, inject}, GroupPanel))` + `slots.inject('sidebar.panellist', …register({name, id:PANEL_ID, order:20, locale, label}, PanelIcon))`。`sidebar.panellist` 与 `main` 由 ui-layout/ui-sidebar 声明，inject 等声明就绪，顺序无关。
- **全局钩子即 props**：`useWorkspaces`（ui-workspace 合并入 GlobalStandardProps）与 `useSessions`（ui-session）会作为全局席位 props 传给每个 slot 组件；面板据此取 `items`（`WorkspaceView{workspaceId,path,title,sessionIds}`）、`archivedSessionIds` 与 `byId`（`SessionSummary{displayTitle,running,blank,updatedAt,origin?}`）。不得自行 import DSH 运行时包——客户端一律结构化类型 + `ctx.inject(['slots','uiWorkspace'], …)`。
- **成员按路径不按 id**：分组存 canonical workspace path；工作区删除重注册后 id 变、路径不变。渲染时以 `useWorkspaces` 的 items 映射，映射失败显示「未注册」置灰行。
- **会话行过滤**：隐藏 archived（registry 全局集合）、blank（临时空白新会话）、`origin === 'subagent'`；按 `updatedAt` 降序。运行状态点直接读 `summary.running`。
- **存储铁律**：`store.js` 载入时容忍损坏——改名 `*.bak-<ts>` 后空启动并在 list 响应带 notice；所有变更走进程内 promise 队列串行 read-modify-write，temp+rename 原子替换；校验：title ≤100 非空、path ≤1024 非空去重、分组 ≤100、每组成员 ≤200。
- **HTTP 面**：`/workspace-group-manager` 前缀路由，回环栅栏（loopback.js，自包含移植）先行，JSON envelope `{ok,value}|{ok:false,error:{code,message}}`，body 上限 64KB；客户端 fetch 用**文档相对路径**（无前导斜杠）。
- **样式纪律**：面板全部内联样式（styles 对象 S），无 ui-primitives import、无 modal portal（延续 mcp 插件对设置面板 z-index 的规避经验；本插件是主面板，菜单用行内 absolute + fixed 透明 backdrop 关闭）。
- **拖拽纪律**：目录行原生 HTML5 draggable（分组内行 fromGroupId=分组 id，未分组行 null）；drop 目标仅分组头与「未分组」头；可放置性/移动计划统一由 `group-move.ts` 纯函数裁决（矩阵：源分组→他组=remove+add、源分组→未分组=remove、未分组→组=add、同组/未分组→未分组=null）。dragOver 高亮用 outline（行悬停背景由 mouseenter/leave 直接改 style，二者互不干扰）；dragLeave 用 relatedTarget containment 防子元素闪烁；拖拽激活期间「未分组」头始终渲染（否则最后一个成员无法拖出）。
- **pnpm 配置**：`autoInstallPeers: false` 写在 pnpm-workspace.yaml（pnpm 11 不读项目 .npmrc 的该键）；peer `@deepseek-ai/dsh` 仅作兼容性声明，宿主运行时由 DSH 自身提供。

## 开发循环

```bash
pnpm install        # 干净安装（esbuild 已 allowBuilds）
pnpm run typecheck  # tsc --noEmit（client TSX，strict）
pnpm test           # node --test
pnpm run build      # 产出 lib/client.js
```

- 插件以 `link:` 方式装在 web profile（`~/.dsh/profiles/web/package.json` 的 dependencies + `dsh.profile.bundles`，或 `dsh plugin --profile web add link:<目录>`），pnpm install 后生效；**bundle 名单变更需要重启 DSH**，已安装状态下改 host 半边即时生效、改 client 半边需重新 build + 刷新页面。

## 验证（完成前必做）

1. `node --check src/host/*.js` + `pnpm run typecheck && pnpm test && pnpm run build` 全部实际执行并确认输出；
2. 存储层改动后 `test/store.test.mjs` 的「未触及语义」断言（幂等成员、损坏备份、并发串行）必须全绿；
3. GUI 手动验收：侧边栏出现「分组」入口；新建分组 → 从「未分组」添加目录 → 展开会话、点击跳转、「+」新会话 → 重命名/移动/移出/删除 → **拖拽：目录行拖到他组头/未分组头（目标高亮、放下即迁移并展开目标），拖回原分组不高亮不接收** → 刷新页面数据仍在 → 中英文案正确；
4. 检查 `<DSH home>/workspace-groups.json` 内容与 UI 一致。

## 已知边界

- 不改动/遮蔽内置工作区浏览器；分组排序不持久化（按创建顺序）；拖拽排序分组头不做（目录行的分组拖拽已支持）。
- 数据为本机全局一份（不分 profile）；多标签并发写 last-write-wins。
- 路由仅回环可用（与 mcp 插件同款栅栏），远程浏览器部署不可管理分组。
