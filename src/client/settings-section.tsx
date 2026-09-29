/**
 * 设置面板的「工作区视图」section：分组视图 / 官方视图 的切换控件。
 * 官方 settings 内容区风格（卡片式选项，参考外观设置的浅色/深色卡片）；
 * 组件为纯 props，模式读取与持久化由注入面提供（见 index.tsx）。
 * @module dsh-workspace-group-manager/client/settings-section
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import { primitives } from './primitives'

type Translator = (key: string, vars?: Record<string, string | number>) => string

export type SidebarMode = 'grouped' | 'official'

export interface ViewModeSectionProps {
  /** Current mode getter — read live, never frozen into the inject face. */
  mode: () => SidebarMode
  /** Persist + apply the mode (live swap, no reload). */
  onChange: (mode: SidebarMode) => void
  /** Shell affordance (owner share) — unused here. */
  close?(): void
  /** Locale seat for the register option's namespace. */
  t?: Translator
}

const S = {
  root: { padding: '4px 2px', fontSize: 13, color: 'inherit', minWidth: 0 } as const,
  title: { fontSize: 18, fontWeight: 600, margin: 0 } as const,
  subtitle: { margin: '6px 0 16px', opacity: 0.7, lineHeight: 1.5 } as const,
  cards: { display: 'flex', gap: 12, flexWrap: 'wrap' } as const,
  card: {
    font: 'inherit',
    color: 'inherit',
    textAlign: 'center',
    width: 180,
    padding: '16px 12px 14px',
    borderRadius: 10,
    border: '1px solid rgba(128,128,128,0.35)',
    background: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
  } as const,
  cardActive: {
    borderColor: '#4d78cc',
    background: 'rgba(77,120,204,0.12)',
  } as const,
  cardTitle: { fontSize: 13.5, fontWeight: 600 } as const,
  cardDesc: { fontSize: 11.5, opacity: 0.6, lineHeight: 1.4 } as const,
  hint: { marginTop: 14, fontSize: 12, opacity: 0.55 } as const,
}

export function ViewModeSection(props: ViewModeSectionProps) {
  const { t = key => key } = props
  const [current, setCurrent] = useState<SidebarMode>(props.mode)
  const FolderIcon = primitives().IconFolderCloseRegular as
    | ((p: { size?: number }) => ReactNode)
    | undefined
  const ListIcon = primitives().IconFlatListOutlineRegular as
    | ((p: { size?: number }) => ReactNode)
    | undefined

  const pick = (mode: SidebarMode) => {
    setCurrent(mode)
    props.onChange(mode)
  }

  const card = (mode: SidebarMode, title: string, desc: string, icon: ReactNode) => (
    <button
      type="button"
      style={current === mode ? { ...S.card, ...S.cardActive } : S.card}
      aria-pressed={current === mode}
      onClick={() => pick(mode)}
    >
      {icon}
      <span style={S.cardTitle}>{title}</span>
      <span style={S.cardDesc}>{desc}</span>
    </button>
  )

  return (
    <div style={S.root}>
      <h2 style={S.title}>{t('settingsTitle')}</h2>
      <p style={S.subtitle}>{t('settingsDesc')}</p>
      <div style={S.cards}>
        {card('grouped', t('modeGrouped'), t('modeGroupedDesc'), FolderIcon ? <FolderIcon size={22} /> : null)}
        {card('official', t('modeOfficial'), t('modeOfficialDesc'), ListIcon ? <ListIcon size={22} /> : null)}
      </div>
      <p style={S.hint}>{t('settingsHint')}</p>
    </div>
  )
}
