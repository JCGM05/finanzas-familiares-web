import type {
  AnnualExpense,
  Category,
  ConfigSummary,
  Goal,
  ImportPreview,
  ImportRow,
  ImportRowPreview,
  MonthDashboard,
  NetWorthEntry,
  NetWorthItem,
  NewTransaction,
  SaldoInfo,
  SuegrosConfig,
  Transaction,
  YearDashboard,
} from './types'

export interface NewGoal {
  nombre: string
  meta: number | string
  ahorrado?: number | string
  fecha_objetivo?: string | null
  orden?: number
}

export interface SecuritySettings {
  login_max_attempts: number
  login_window_minutes: number
  login_block_minutes: number
  mfa_max_attempts: number
}

// En dev, Vite proxya /api -> http://127.0.0.1:8000 (ver vite.config.ts).
const BASE = '/api'
const TOKEN_KEY = 'ff_token'

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

async function req<T>(path: string, options?: RequestInit, tokenOverride?: string): Promise<T> {
  const token = tokenOverride ?? tokenStore.get()
  const res = await fetch(BASE + path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  })
  if (res.status === 401 && !path.startsWith('/auth/')) {
    tokenStore.clear()
    onUnauthorized?.()
  }
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail ?? detail
    } catch {
      /* respuesta sin cuerpo JSON */
    }
    throw new Error(`${res.status}: ${detail}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

async function upload<T>(path: string, file: File): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  const token = tokenStore.get()
  const res = await fetch(BASE + path, {
    method: 'POST',
    body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (res.status === 401) {
    tokenStore.clear()
    onUnauthorized?.()
  }
  if (!res.ok) {
    let detail = res.statusText
    try {
      detail = (await res.json()).detail ?? detail
    } catch {
      /* sin cuerpo */
    }
    throw new Error(`${res.status}: ${detail}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  // Dashboard
  monthDashboard: (anio: number, mes: number) =>
    req<MonthDashboard>(`/dashboard/month?anio=${anio}&mes=${mes}`),
  yearDashboard: (anio: number) => req<YearDashboard>(`/dashboard/year?anio=${anio}`),
  saldo: () => req<SaldoInfo>('/dashboard/saldo'),
  efectivo: (anio: number, mes: number) => req<import('./types').EfectivoInfo>(`/dashboard/efectivo?anio=${anio}&mes=${mes}`),

  // Categorías
  categories: (incluirInactivas = false) =>
    req<Category[]>(`/categories${incluirInactivas ? '?incluir_inactivas=true' : ''}`),
  updateCategory: (
    id: number,
    p: Partial<{ nombre: string; tipo: string; grupo: string; dia_cargo: number | null; presupuesto_mensual: number | string; es_apoyo_suegros: boolean; activa: boolean; orden: number }>,
  ) => req<Category>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(p) }),
  updateAnnualExpense: (id: number, p: Record<string, unknown>) =>
    req<AnnualExpense>(`/config/annual-expenses/${id}`, { method: 'PATCH', body: JSON.stringify(p) }),

  // Movimientos
  transactions: (params?: { anio?: number; mes?: number; category_id?: number; pagado_con?: string }) => {
    const q = new URLSearchParams()
    if (params?.anio) q.set('anio', String(params.anio))
    if (params?.mes) q.set('mes', String(params.mes))
    if (params?.category_id) q.set('category_id', String(params.category_id))
    if (params?.pagado_con) q.set('pagado_con', params.pagado_con)
    const qs = q.toString()
    return req<Transaction[]>(`/transactions${qs ? '?' + qs : ''}`)
  },
  createTransaction: (t: NewTransaction) =>
    req<Transaction>('/transactions', { method: 'POST', body: JSON.stringify(t) }),
  updateTransaction: (id: number, t: Partial<NewTransaction>) =>
    req<Transaction>(`/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(t) }),
  deleteTransaction: (id: number) =>
    req<void>(`/transactions/${id}`, { method: 'DELETE' }),

  // Objetivos
  goals: () => req<Goal[]>('/goals'),
  createGoal: (g: NewGoal) => req<Goal>('/goals', { method: 'POST', body: JSON.stringify(g) }),
  updateGoal: (id: number, g: Partial<NewGoal>) =>
    req<Goal>(`/goals/${id}`, { method: 'PATCH', body: JSON.stringify(g) }),
  deleteGoal: (id: number) => req<void>(`/goals/${id}`, { method: 'DELETE' }),

  // Configuración
  configSummary: () => req<ConfigSummary>('/config/summary'),
  annualExpenses: () => req<AnnualExpense[]>('/config/annual-expenses'),
  suegrosConfig: () => req<SuegrosConfig | null>('/config/suegros'),
  updateSuegrosConfig: (p: { meses_previstos?: number; fecha_desde?: string }) =>
    req<SuegrosConfig>('/config/suegros', { method: 'PATCH', body: JSON.stringify(p) }),
  updateIncomeProfile: (
    id: number,
    p: { nomina_mensual?: number | string; num_pagas?: number; pct_a_comun?: number | string; meses_pagas_extra?: string },
  ) => req(`/config/income/${id}`, { method: 'PATCH', body: JSON.stringify(p) }),
  balance: () => req<import('./types').BalanceSnapshotOut>('/config/balance'),

  // Patrimonio
  netWorthItems: () => req<NetWorthItem[]>('/networth/items'),
  netWorthEntries: (anio: number) => req<NetWorthEntry[]>(`/networth/entries?anio=${anio}`),
  upsertNetWorthEntry: (e: { item_id: number; anio: number; mes: number; importe: number | string }) =>
    req<NetWorthEntry>('/networth/entries', { method: 'PUT', body: JSON.stringify(e) }),

  // Auth
  login: (username: string, password: string) =>
    req<{ status: string; temp_token: string; access_token: string | null }>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  mfaSetup: (tempToken: string) =>
    req<{ secret: string; otpauth_uri: string; qr_data_uri: string }>('/auth/mfa/setup', { method: 'POST' }, tempToken),
  mfaVerifySetup: (tempToken: string, code: string) =>
    req<{ access_token: string; recovery_codes: string[] }>('/auth/mfa/verify-setup', { method: 'POST', body: JSON.stringify({ code }) }, tempToken),
  mfaVerify: (tempToken: string, code: string) =>
    req<{ access_token: string }>('/auth/mfa/verify', { method: 'POST', body: JSON.stringify({ code }) }, tempToken),
  mfaRecovery: (tempToken: string, code: string) =>
    req<{ access_token: string }>('/auth/mfa/recovery', { method: 'POST', body: JSON.stringify({ code }) }, tempToken),
  me: () => req<import('./types').UserOut>('/auth/me'),
  changePassword: (current_password: string, new_password: string) =>
    req<void>('/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password, new_password }) }),
  recoveryStatus: () => req<{ remaining: number }>('/auth/recovery-codes/status'),
  regenerateRecovery: (password: string) =>
    req<{ recovery_codes: string[] }>('/auth/recovery-codes/regenerate', { method: 'POST', body: JSON.stringify({ password }) }),
  mfaReset: (password: string) =>
    req<void>('/auth/mfa/reset', { method: 'POST', body: JSON.stringify({ password }) }),

  // Ajustes
  publicSettings: () => req<{ app_name: string }>('/settings/public'),
  updateAppName: (app_name: string) =>
    req<{ app_name: string }>('/settings/app-name', { method: 'PUT', body: JSON.stringify({ app_name }) }),
  getSecurity: () => req<SecuritySettings>('/settings/security'),
  updateSecurity: (p: SecuritySettings) =>
    req<SecuritySettings>('/settings/security', { method: 'PUT', body: JSON.stringify(p) }),

  // Administración (cuenta de rescate)
  adminUsers: () => req<import('./types').AdminUser[]>('/admin/users'),
  adminResetPassword: (id: number, admin_password: string, new_password: string) =>
    req<void>(`/admin/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ admin_password, new_password }) }),
  adminResetMfa: (id: number, admin_password: string) =>
    req<void>(`/admin/users/${id}/reset-mfa`, { method: 'POST', body: JSON.stringify({ admin_password }) }),
  adminUnlock: (id: number, admin_password: string) =>
    req<void>(`/admin/users/${id}/unlock`, { method: 'POST', body: JSON.stringify({ admin_password }) }),

  // Importar
  importParse: (file: File) => upload<ImportRow[]>('/import/parse', file),
  importPreview: (payload: { filas: ImportRow[]; saldo_anterior: string; saldo_real_banco?: string | null }) =>
    req<ImportPreview>('/import/preview', { method: 'POST', body: JSON.stringify(payload) }),
  importCommit: (filas: Array<{ fecha: string; tipo: string; category_id: number; descripcion?: string | null; importe: string; pagado_con?: string }>) =>
    req<{ insertados: number; duplicados_saltados: number }>('/import/commit', { method: 'POST', body: JSON.stringify({ filas }) }),
}

export type { ImportRowPreview }
