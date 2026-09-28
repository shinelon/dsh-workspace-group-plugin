# dsh-workspace-group-plugin

DeepSeek Harness（DSH）Web 客户端插件：在侧边栏新增一个「分组」面板，把工作目录组织成自定义分组。

![icon](icon.svg)

## 功能

- **侧边栏「分组」面板**：与内置「定时任务」「插件管理」面板同级（`sidebar.panellist` 图标行 + `main` keyed 槽页面），内置工作区浏览器零改动。
- **自定义分组**：新建 / 重命名 / 删除分组；一个工作目录可属多个分组；不属于任何分组的工作目录进入「未分组」区。
- **菜单管理**：工作目录行「移动到分组… / 新建分组并移入 / 从分组移除」；分组行「添加工作目录」。
- **会话浏览**：展开分组内的工作目录显示其会话（过滤归档 / 空白 / subagent 行，运行中带状态点），点击会话跳转对话，行尾「+」在该目录开新会话。
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

然后 `pnpm install --dir ~/.dsh/profiles/web`，**重启 DSH**（bundle 名单变更需重启），刷新页面即可看到侧边栏底部的「分组」入口。

## 开发

```bash
pnpm install        # esbuild 已加入 allowBuilds；autoInstallPeers=false（peer 仅作引擎声明）
pnpm run typecheck  # tsc --noEmit（client TSX，strict）
pnpm test           # node --test（store / routes / loopback）
pnpm run build      # esbuild 打包 client → lib/client.js
```

- 宿主半边（`src/host/*.js`）是纯 ESM JS，免构建；浏览器半边（`src/client/*.tsx`）改动后需 `pnpm run build` + 刷新页面。
- 插件以 `link:` 方式装入 web profile；已安装状态下改完重新 build 后刷新页面即生效，只有 bundle 名单变更才需要重启 DSH。

## 架构速览

```
浏览器半边 src/client（TSX → esbuild → lib/client.js）
  index.tsx   注册 locale 词典；slots.inject('main' + 'sidebar.panellist')
  panel.tsx   分组面板：分组 → 工作目录 → 会话；内联样式，无 portal
  api.ts      /workspace-group-manager/* envelope fetch（文档相对路径）
  locales.ts  zh / en 词典（NS = workspace-group-manager）
宿主半边 src/host（纯 ESM JS，免构建）
  index.js    cordis 插件入口（inject: ['webServer']）
  routes.js   /workspace-group-manager 前缀路由：list/create/rename/delete/add-members/remove-member
  store.js    JSON 存储层：容错加载、进程内队列串行写、temp+rename 原子落盘
  loopback.js 回环信任栅栏（socket + Host + sec-fetch-site/Origin）
```

数据模型（`workspace-groups.json`）：

```jsonc
{ "version": 1, "groups": [ { "id": "uuid", "title": "dsh 插件", "paths": ["D:\\..."], "createdAt": "...", "updatedAt": "..." } ] }
```

成员按工作区 canonical path 存储（工作区删除重注册后 id 会变，路径稳定）；渲染时经全局 `useWorkspaces` 钩子把路径映射回工作区视图，映射不上的显示为置灰「未注册」行。

## 边界

- 不改动内置工作区浏览器的任何行为（搜索、置顶、归档、拖拽等均为原生功能，照常可用）。
- 分组数据为本机全局一份（不分 profile）；多标签并发写为 last-write-wins。
- 数据文件损坏时自动备份为 `*.bak-<时间戳>` 并以空数据启动，面板顶部会显示提示。

## License

MIT
