import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { InventoryProvider } from '@/context/InventoryContext'
import { NavBar } from '@/components/dashboard/NavBar'
import { MetricsStrip } from '@/components/dashboard/MetricsStrip'
import { InventoryView } from '@/components/dashboard/InventoryView'
import { ReviewQueue } from '@/components/dashboard/ReviewQueue'
import { UploadPage } from '@/components/upload/UploadPage'

export default function App() {
  return (
    <BrowserRouter>
      <InventoryProvider>
        <div className="min-h-screen bg-background flex flex-col">
          <NavBar />
          <MetricsStrip />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Navigate to="/inventory" replace />} />
              <Route path="/inventory" element={<InventoryView />} />
              <Route path="/review" element={<ReviewQueue />} />
              <Route path="/upload" element={<UploadPage />} />
            </Routes>
          </main>
        </div>
      </InventoryProvider>
    </BrowserRouter>
  )
}
