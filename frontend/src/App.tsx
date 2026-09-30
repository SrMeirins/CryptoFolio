import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { Portfolio } from './pages/Portfolio'
import { Fiscal } from './pages/Fiscal'
import { ImportPage } from './pages/Import'
import { History } from './pages/History'
import { Settings } from './pages/Settings'
import { useLivePrices } from './hooks/useLivePrices'
import { ToastProvider } from './components/Toast'
import { UpdateBanner } from './components/UpdateBanner'
import { TopBar } from './components/TopBar'

function RoutedContent() {
  const { pathname } = useLocation()
  return (
    <div key={pathname} className="animate-page-in min-h-full">
      <Routes>
        <Route path="/"         element={<Dashboard />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/fiscal"   element={<Fiscal />} />
        <Route path="/import"   element={<ImportPage />} />
        <Route path="/history"  element={<History />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  )
}

export default function App() {
  useLivePrices()

  // React Router v7: los future flags v7_startTransition/v7_relativeSplatPath
  // ya eran el comportamiento activado en v6; en v7 son el único
  // comportamiento y la prop future ya no existe en BrowserRouter.
  return (
    <BrowserRouter>
      <ToastProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden bg-background-primary">
          <UpdateBanner />
          <TopBar />
          <main className="flex-1 overflow-y-auto">
            <RoutedContent />
          </main>
        </div>
      </div>
      </ToastProvider>
    </BrowserRouter>
  )
}
