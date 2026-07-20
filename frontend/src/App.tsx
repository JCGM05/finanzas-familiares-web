import { BrowserRouter, Route, Routes } from 'react-router-dom'
import ForcePasswordChange from './components/ForcePasswordChange'
import Layout from './components/Layout'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PeriodProvider } from './context/PeriodContext'
import { ThemeProvider } from './context/ThemeContext'
import AdminPanel from './pages/AdminPanel'
import Configuracion from './pages/Configuracion'
import Efectivo from './pages/Efectivo'
import Importar from './pages/Importar'
import Inicio from './pages/Inicio'
import Login from './pages/Login'
import Movimientos from './pages/Movimientos'
import Objetivos from './pages/Objetivos'
import PanelAnual from './pages/PanelAnual'
import PanelMensual from './pages/PanelMensual'
import Patrimonio from './pages/Patrimonio'

function Protected() {
  const { user, ready } = useAuth()
  if (!ready) return <div className="p-10 text-center text-slate-400">Cargando…</div>
  if (!user) return <Login />
  // Contraseña temporal: modal bloqueante hasta cambiarla.
  if (user.must_change_password) return <ForcePasswordChange />
  // Cuenta de rescate: solo el panel de administración, sin acceso a finanzas.
  if (user.is_admin) return <AdminPanel />
  return (
    <PeriodProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Inicio />} />
          <Route path="mensual" element={<PanelMensual />} />
          <Route path="anual" element={<PanelAnual />} />
          <Route path="movimientos" element={<Movimientos />} />
          <Route path="efectivo" element={<Efectivo />} />
          <Route path="importar" element={<Importar />} />
          <Route path="objetivos" element={<Objetivos />} />
          <Route path="patrimonio" element={<Patrimonio />} />
          <Route path="configuracion" element={<Configuracion />} />
        </Route>
      </Routes>
    </PeriodProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Protected />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
