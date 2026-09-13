'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, LogOut, ChevronDown } from 'lucide-react'
import { Icon } from '@/components/ui/icon'
import { cn, initials } from '@/lib/utils'
import { navForRole, primaryNav, ROLE_LABEL, type NavGroup } from '@/lib/nav'
import type { Role } from '@/generated/prisma/enums'
import { Logo } from '@/components/layout/logo'
import { logout } from '@/server/auth/actions'

export type ShellUser = {
  fullName: string
  username: string
  role: Role
  departmentName: string | null
}

/** Actif si le chemin correspond exactement, ou en est un sous-segment. */
function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  // Une racine de section ne doit pas s'allumer pour toutes ses sœurs.
  const roots = ['/employe', '/economat', '/admin']
  if (roots.includes(href)) return false
  return pathname.startsWith(href + '/')
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const groups = React.useMemo(() => navForRole(user.role), [user.role])
  const bottom = React.useMemo(() => primaryNav(user.role), [user.role])

  React.useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  React.useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  return (
    <div className="flex min-h-dvh w-full">
      {/* Barre latérale — ordinateur */}
      <aside className="no-print sticky top-0 hidden h-dvh w-[16.5rem] shrink-0 flex-col gap-1 border-r border-[rgb(var(--glass-edge)/0.18)] bg-white/45 px-3 py-4 backdrop-blur-2xl lg:flex">
        <div className="px-2 pb-3">
          <Logo />
        </div>
        <SidebarNav groups={groups} pathname={pathname} />
        <UserCard user={user} />
      </aside>

      {/* Tiroir — mobile et tablette */}
      {drawerOpen ? (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Fermer le menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-[#0a1830]/45 backdrop-blur-sm"
          />
          <div className="animate-rise absolute inset-y-0 left-0 flex w-[17rem] max-w-[86vw] flex-col gap-1 border-r border-[rgb(var(--glass-edge)/0.2)] bg-[var(--bg-3)]/95 px-3 py-4 backdrop-blur-2xl">
            <div className="flex items-center justify-between px-2 pb-3">
              <Logo />
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Fermer"
                className="grid size-9 place-items-center rounded-xl text-fg-muted hover:bg-[rgb(var(--glass-edge)/0.16)]"
              >
                <X className="size-5" />
              </button>
            </div>
            <SidebarNav groups={groups} pathname={pathname} />
            <UserCard user={user} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} onMenu={() => setDrawerOpen(true)} />
        <main className="mx-auto w-full max-w-[100rem] flex-1 px-3 pb-24 pt-4 sm:px-5 sm:pb-8 lg:px-7">
          {children}
        </main>
        <BottomNav items={bottom} pathname={pathname} />
      </div>
    </div>
  )
}

function SidebarNav({ groups, pathname }: { groups: NavGroup[]; pathname: string }) {
  return (
    <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-2">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="px-3 pb-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.09em] text-fg-subtle">
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-[0.87rem] transition-colors',
                      active
                        ? 'bg-white/80 font-semibold text-accent shadow-[0_1px_0_0_rgb(255_255_255/0.8)_inset,0_6px_16px_-10px_rgb(20_46_88/0.5)]'
                        : 'text-fg-muted hover:bg-[rgb(var(--glass-edge)/0.14)] hover:text-fg',
                    )}
                  >
                    {active ? (
                      <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-accent" />
                    ) : null}
                    <Icon name={item.icon} className="size-[1.05rem] shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function UserCard({ user }: { user: ShellUser }) {
  const [open, setOpen] = React.useState(false)

  return (
    <div className="relative shrink-0 border-t border-[rgb(var(--glass-edge)/0.18)] pt-2">
      {open ? (
        <div className="absolute bottom-full left-0 mb-2 w-full overflow-hidden rounded-xl border border-[rgb(var(--glass-edge)/0.24)] bg-[var(--bg-3)]/97 p-1 shadow-lg backdrop-blur-xl">
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[0.85rem] text-danger hover:bg-danger/10"
            >
              <LogOut className="size-4" />
              Se déconnecter
            </button>
          </form>
        </div>
      ) : null}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-[rgb(var(--glass-edge)/0.14)]"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[var(--accent-soft)] to-[var(--accent)] text-[0.78rem] font-bold text-white">
          {initials(user.fullName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.84rem] font-medium text-fg">{user.fullName}</span>
          <span className="block truncate text-[0.74rem] text-fg-subtle">
            {ROLE_LABEL[user.role]}
            {user.departmentName ? ` · ${user.departmentName}` : ''}
          </span>
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-fg-subtle transition-transform', open && 'rotate-180')} />
      </button>
    </div>
  )
}

function TopBar({ user, onMenu }: { user: ShellUser; onMenu: () => void }) {
  return (
    <header className="no-print sticky top-0 z-30 border-b border-[rgb(var(--glass-edge)/0.16)] bg-[var(--bg)]/75 backdrop-blur-2xl">
      <div className="mx-auto flex h-14 w-full max-w-[100rem] items-center gap-3 px-3 sm:px-5 lg:px-7">
        <button
          onClick={onMenu}
          aria-label="Ouvrir le menu"
          className="grid size-9 shrink-0 place-items-center rounded-xl text-fg-muted hover:bg-[rgb(var(--glass-edge)/0.16)] lg:hidden"
        >
          <Menu className="size-5" />
        </button>

        <div className="lg:hidden">
          <Logo compact />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {user.departmentName ? (
            <span className="hidden rounded-full border border-[rgb(var(--glass-edge)/0.28)] bg-white/55 px-2.5 py-1 text-[0.76rem] font-medium text-fg-muted sm:inline">
              {user.departmentName}
            </span>
          ) : null}
        </div>
      </div>
    </header>
  )
}

function BottomNav({
  items, pathname,
}: {
  items: ReturnType<typeof primaryNav>
  pathname: string
}) {
  if (items.length === 0) return null
  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-[rgb(var(--glass-edge)/0.2)] bg-[var(--bg)]/92 backdrop-blur-2xl lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex items-stretch">
        {items.map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-1 px-1 py-2.5 text-[0.66rem] font-medium transition-colors',
                  active ? 'text-accent' : 'text-fg-subtle',
                )}
              >
                <Icon name={item.icon} className={cn('size-[1.15rem]', active && 'stroke-[2.4]')} />
                <span className="w-full truncate text-center leading-tight">
                  {item.shortLabel ?? item.label}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
