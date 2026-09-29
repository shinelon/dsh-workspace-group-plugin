# dsh-workspace-group-plugin

DeepSeek Harness（DSH）Web 客户端插件：在侧边栏工作区位置以自定义分组展示工作目录（原地遮蔽官方浏览区，一键切回官方视图）。

![icon](icon.svg)

## 功能

- **侧边栏分组视图**：以 priority -1 遮蔽官方工作区浏览区（`sidebar.workspaces` single 槽），原地展示自定义分组树；官方浏览器条目保持注册，区头「☰ 使用官方视图」一键原样恢复（官方模式下侧栏底部有切回图标）。
- **自定义分组**：区头「＋」新建分组（内联命名，创建后自动展开）；分组「⋯」重命名 / 删除；一个工作目录可属多个分组；不属于任何分组的目录进入「未分组」区。
- **菜单 + 拖拽管理**：目录行直接拖到目标分组头移入、拖到「未分组」头移出、拖到同组/异组目录行上/下半排序（合法目标高亮官方放置线）；也可走「…」菜单「移动到分组… / 从分组移除」。
- **目录操作**：「＋」开新会话、「⋯」重命名 / 删除（走官方 workspaces 服务）、「添加工作目录」经系统选择器注册。
- **会话浏览**：展开目录显示其会话（过滤归档 / 空白 / subagent 行，运行中带状态点，置顶居前带图钉），点击会话跳转对话；会话「⋯」置顶 / 重命名（或双击标题）/ 分叉 / 归档，归档运行中会话弹出「停止并归档」横幅。
- **视图选项**（官方同款滑杆菜单，持久化到浏览器）：分组方式（按分组 / 按工作区 / 按工作区树 / 单列表）、排序方式（手动 / 最近更新）、筛选会话（隐藏 / 全部 / 仅已归档）。
- **持久化**：分组数据存 `<DSH home>/workspace-groups.json`（尊重 `DSH_HOME`；默认 `~/.dsh`），跨会话、跨重启保留。
- **中英文案**：跟随 DSH 语言设置。

## 安装

前置：本机已安装 DSH ≥ 0.1.7-rc.2，插件目录已执行过 `pnpm install && pnpm run build`。

方式一（CLI，若 `dsh` 命令可用）：

```bash
dsh plugin --profile web add link:D:/dsh_space/dsh_plugins/dsh-workspace-group-plugin
```

方式二（手工，等效）：在 `~/.dsh/profiles/web/package.json` 中：

- `dsh.profile.bundles` 数组加入 `"@local/workspace-group-manager"`
- `dependencies` 加入 `"@local/workspace-group-manager": "link:D:/dsh_space/dsh_plugins/dsh-workspace-group-plugin"`

然后 `pnpm install --dir ~/.dsh/profiles/web`，**重启 DSH**（bundle 名单变更需重启），刷新页面即生效。

## 开发

```bash
pnpm install        # esbuild 已加入 allowBuilds；autoInstallPeers=false（peer 仅作引擎声明）
pnpm run typecheck  # tsc --noEmit（client TSX，strict）
pnpm test           # node --test（store / routes / loopback / group-move）
pnpm run build      # esbuild 打包 client → lib/client.js（write:false + Node 落盘）
```

- 宿主半边（`src/host/*.js`）是纯 ESM JS，免构建，改动后**重启 DSH** 生效；浏览器半边（`src/client/*.tsx`）改动后 `pnpm run build` + 刷新页面即生效（bundle 按mtime 换版本，HMR 自动切换）。
- 插件以 `link:` 方式装入 web profile；只有 bundle 名单变更才需要重启 DSH。

## 架构速览

```
浏览器半边 src/client（TSX → esbuild → lib/client.js）
  index.tsx     注册 locale 词典；按模式遮蔽 sidebar.workspaces / 注册切回哨兵
  region.tsx    侧栏分组视图：分组 → 工作目录 → 会话（官方类名 + 官方图标/Menu/Tooltip，
                指针拖拽 + dataTransfer 驱动放置，视图选项菜单）
  group-move.ts 拖拽移动矩阵（纯函数，可单测）
  primitives.ts loader require 访问 ui-primitives（图标/Menu/Tooltip）
  face.ts       注入面类型（api / nav / ws 三组动词）
  panel.tsx     共享样式与图标基元（history: 独立分组面板，现已并入侧栏视图）
  api.ts        /workspace-group-manager/* envelope fetch（文档相对路径）
  locales.ts    zh / en 词典（NS = workspace-group-manager，官方带点键名）
宿主半边 src/host（纯 ESM JS，免构建）
  index.js      cordis 插件入口（inject: ['webServer']）
  routes.js     /workspace-group-manager 前缀路由：list/create/rename/delete/
                add-members/remove-member/reorder-members/reorder-groups
  store.js      JSON 存储层：容错加载、进程内队列串行写、temp+rename 原子落盘
  loopback.js   回环信任栅栏（socket + Host + sec-fetch-site/Origin）
```

数据模型（`workspace-groups.json`）：

```jsonc
{ "version": 1, "groups": [ { "id": "uuid", "title": "dsh 插件", "paths": ["D:\\..."], "createdAt": "...", "updatedAt": "..." } ] }
```

成员按工作区 canonical path 存储（工作区删除重注册后 id 会变，路径稳定）；渲染时经全局 `useWorkspaces` 钩子把路径映射回工作区视图，映射不上的显示为置灰「未注册」行。

## 边界

- 遮蔽仅在分组模式生效；「使用官方视图」后官方浏览器逐项原样可用，分组数据与官方注册表完全解耦（官方数据零写入，仅调官方公开服务）。
- 官方 CSS 类名（`YDXeBa_*` / `bhn1Oq_*`）与行结构按 0.1.7-rc.2 硬编码，升级 DSH 需复核。
- 分组数据为本机全局一份（不分 profile）；多标签并发写为 last-write-wins。
- 数据文件损坏时自动备份为 `*.bak-<时间戳>` 并以空数据启动，区头下方会显示提示。

## License

MIT
