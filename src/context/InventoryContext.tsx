import React, { createContext, useContext } from 'react'
import { useInventory, UseInventoryReturn } from '@/hooks/useInventory'

const InventoryContext = createContext<UseInventoryReturn | null>(null)

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const value = useInventory()
  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>
}

export function useInventoryContext(): UseInventoryReturn {
  const ctx = useContext(InventoryContext)
  if (!ctx) throw new Error('useInventoryContext must be used within InventoryProvider')
  return ctx
}
