import type { ReactNode } from 'react'

export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{children}</h2>
}

export function Bar({ pct, danger }: { pct: number; danger?: boolean }) {
  const capped = Math.min(100, Math.max(0, pct * 100))
  const over = pct > 1
  const color = over || danger ? 'bg-salmon-500' : 'bg-verde-500'
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${capped}%` }} />
    </div>
  )
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return <div className="p-8 text-center text-slate-400 dark:text-slate-500">{label}</div>
}

export function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl border border-salmon-500 bg-salmon-50 dark:bg-salmon-500/15 p-4 text-sm text-salmon-600">
      {msg}
    </div>
  )
}
