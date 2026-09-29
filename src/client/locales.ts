/**
 * Locale dictionaries for the workspace-group-manager surfaces. Registered
 * under the package-owned namespace and selected by the DSH language setting
 * (zh / en both provided); keys follow the official dotted convention.
 * @module dsh-workspace-group-manager/client/locales
 */

export const NS = 'workspace-group-manager'

export interface WsgLocaleKeyMap {
  panel: 'panel'
  title: 'title'
  workspaceTitle: 'workspaceTitle'
  createGroup: 'createGroup'
  ungrouped: 'ungrouped'
  noGroups: 'noGroups'
  emptyGroup: 'emptyGroup'
  addWorkspace: 'addWorkspace'
  nothingToAdd: 'nothingToAdd'
  moveToGroup: 'moveToGroup'
  addToGroup: 'addToGroup'
  newGroupAndMove: 'newGroupAndMove'
  removeFromGroup: 'removeFromGroup'
  rename: 'rename'
  delete: 'delete'
  confirmDelete: 'confirmDelete'
  newSession: 'newSession'
  noSessions: 'noSessions'
  unregistered: 'unregistered'
  loadFailed: 'loadFailed'
  retry: 'retry'
  incompatible: 'incompatible'
  membersCount: 'membersCount'
  dropToUngrouped: 'dropToUngrouped'
  useOfficialView: 'useOfficialView'
  useGroupedView: 'useGroupedView'
  more: 'more'
  pin: 'pin'
  unpin: 'unpin'
  fork: 'fork'
  archive: 'archive'
  unarchive: 'unarchive'
  stopAndArchive: 'stopAndArchive'
  stopAndArchiveAsk: 'stopAndArchiveAsk'
  cancel: 'cancel'
  'viewOptions.label': 'viewOptions.label'
  'groupBy.label': 'groupBy.label'
  'groupBy.groups': 'groupBy.groups'
  'groupBy.workspace': 'groupBy.workspace'
  'groupBy.workspaceTree': 'groupBy.workspaceTree'
  'groupBy.flat': 'groupBy.flat'
  'orderBy.label': 'orderBy.label'
  'orderBy.manual': 'orderBy.manual'
  'orderBy.updated': 'orderBy.updated'
  'filterBy.label': 'filterBy.label'
  'viewOptions.hideArchived': 'viewOptions.hideArchived'
  'viewOptions.showArchived': 'viewOptions.showArchived'
  'viewOptions.onlyArchived': 'viewOptions.onlyArchived'
  'empty.noneArchived': 'empty.noneArchived'
  'empty.viewOthers': 'empty.viewOthers'
  settingsNav: 'settingsNav'
  settingsTitle: 'settingsTitle'
  settingsDesc: 'settingsDesc'
  settingsHint: 'settingsHint'
  modeGrouped: 'modeGrouped'
  modeGroupedDesc: 'modeGroupedDesc'
  modeOfficial: 'modeOfficial'
  modeOfficialDesc: 'modeOfficialDesc'
}

export const zh: Record<keyof WsgLocaleKeyMap, string> = {
  panel: '分组',
  title: '工作区分组',
  workspaceTitle: '工作区',
  createGroup: '新建分组',
  ungrouped: '未分组',
  noGroups: '还没有分组，点击「新建分组」开始整理工作目录。',
  emptyGroup: '暂无工作目录',
  addWorkspace: '添加工作目录',
  nothingToAdd: '没有可添加的工作目录',
  moveToGroup: '移动到分组…',
  addToGroup: '添加到分组…',
  newGroupAndMove: '新建分组并移入',
  removeFromGroup: '从分组移除',
  rename: '重命名',
  delete: '删除',
  confirmDelete: '确认删除？',
  newSession: '新会话',
  noSessions: '暂无会话',
  unregistered: '未注册',
  loadFailed: '加载分组失败',
  retry: '重试',
  incompatible: '此面板需要较新版本的 DSH（缺少全局工作区数据）。',
  membersCount: '{count} 个目录',
  dropToUngrouped: '拖到此处移出分组',
  useOfficialView: '使用官方视图',
  useGroupedView: '工作区分组视图',
  more: '更多',
  pin: '置顶',
  unpin: '取消置顶',
  fork: '分叉',
  archive: '归档',
  unarchive: '取消归档',
  stopAndArchive: '停止并归档',
  stopAndArchiveAsk: '会话仍有工作进行，停止并归档？',
  cancel: '取消',
  'viewOptions.label': '视图选项',
  'groupBy.label': '分组方式',
  'groupBy.groups': '按分组（自定义）',
  'groupBy.workspace': '按工作区',
  'groupBy.workspaceTree': '按工作区树',
  'groupBy.flat': '单列表',
  'orderBy.label': '排序方式',
  'orderBy.manual': '手动排序',
  'orderBy.updated': '最近更新',
  'filterBy.label': '筛选会话',
  'viewOptions.hideArchived': '隐藏已归档',
  'viewOptions.showArchived': '全部对话（显示已归档）',
  'viewOptions.onlyArchived': '仅显示已归档',
  'empty.noneArchived': '暂无已归档会话',
  'empty.viewOthers': '查看其他会话',
  settingsNav: '工作区视图',
  settingsTitle: '工作区视图',
  settingsDesc: '选择侧边栏「工作区」区域使用自定义分组视图，还是保持官方工作区列表。两种视图共用同一份工作区与会话数据。',
  settingsHint: '切换立即生效，无需刷新页面。',
  modeGrouped: '分组视图',
  modeGroupedDesc: '按自定义分组组织工作目录',
  modeOfficial: '官方视图',
  modeOfficialDesc: '官方工作区列表，功能原样',
}

export const en: Record<keyof WsgLocaleKeyMap, string> = {
  panel: 'Groups',
  title: 'Workspace Groups',
  workspaceTitle: 'Workspaces',
  createGroup: 'New group',
  ungrouped: 'Ungrouped',
  noGroups: 'No groups yet — click "New group" to start organizing your directories.',
  emptyGroup: 'No directories',
  addWorkspace: 'Add directory',
  nothingToAdd: 'Nothing to add',
  moveToGroup: 'Move to group…',
  addToGroup: 'Add to group…',
  newGroupAndMove: 'New group and move',
  removeFromGroup: 'Remove from group',
  rename: 'Rename',
  delete: 'Delete',
  confirmDelete: 'Confirm delete?',
  newSession: 'New session',
  noSessions: 'No sessions',
  unregistered: 'Unregistered',
  loadFailed: 'Failed to load groups',
  retry: 'Retry',
  incompatible: 'This panel needs a newer DSH (global workspace data missing).',
  membersCount: '{count} directories',
  dropToUngrouped: 'Drop here to ungroup',
  useOfficialView: 'Use official view',
  useGroupedView: 'Workspace groups view',
  more: 'More',
  pin: 'Pin',
  unpin: 'Unpin',
  fork: 'Fork',
  archive: 'Archive',
  unarchive: 'Unarchive',
  stopAndArchive: 'Stop and archive',
  stopAndArchiveAsk: 'Session still has running work — stop and archive?',
  cancel: 'Cancel',
  'viewOptions.label': 'View options',
  'groupBy.label': 'Group by',
  'groupBy.groups': 'By groups (custom)',
  'groupBy.workspace': 'By workspace',
  'groupBy.workspaceTree': 'By workspace tree',
  'groupBy.flat': 'Single list',
  'orderBy.label': 'Order by',
  'orderBy.manual': 'Manual',
  'orderBy.updated': 'Recent updates',
  'filterBy.label': 'Filter sessions',
  'viewOptions.hideArchived': 'Hide archived',
  'viewOptions.showArchived': 'All (show archived)',
  'viewOptions.onlyArchived': 'Archived only',
  'empty.noneArchived': 'No archived sessions',
  'empty.viewOthers': 'View other sessions',
  settingsNav: 'Workspace view',
  settingsTitle: 'Workspace view',
  settingsDesc: 'Choose whether the sidebar workspace area uses the custom grouped view or the official workspace list. Both views share the same workspaces and sessions.',
  settingsHint: 'Changes apply immediately — no reload needed.',
  modeGrouped: 'Grouped view',
  modeGroupedDesc: 'Organize directories into custom groups',
  modeOfficial: 'Official view',
  modeOfficialDesc: 'The official workspace list, unchanged',
}
