import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { Portfolio } from './pages/Portfolio'
import { Fiscal } from './pages/Fiscal'
import { ImportPage } from './pages/Import'
import { History } from './pages/History'
import { Settings } from './pages/Settings'
import { useLivePrices } from './hooks/useLivePrices'

export default function App() {
  useLivePrices()

  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-background-primary">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/fiscal" element={<Fiscal />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/history" element={<History />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
