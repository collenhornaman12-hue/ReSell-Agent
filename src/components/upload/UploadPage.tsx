import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { BatchUpload } from './BatchUpload'
import { MobileUpload } from './MobileUpload'
import { Monitor, Smartphone } from 'lucide-react'

export function UploadPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">ResellAgent</h1>
          <p className="text-muted-foreground text-sm mt-1">Upload photos to start the listing pipeline</p>
        </div>

        <Tabs defaultValue="desktop">
          <TabsList className="mb-6 w-full">
            <TabsTrigger value="desktop" className="flex-1 gap-2">
              <Monitor className="h-4 w-4" />
              Desktop Batch
            </TabsTrigger>
            <TabsTrigger value="mobile" className="flex-1 gap-2">
              <Smartphone className="h-4 w-4" />
              Mobile Session
            </TabsTrigger>
          </TabsList>

          <TabsContent value="desktop">
            <BatchUpload />
          </TabsContent>

          <TabsContent value="mobile">
            <MobileUpload />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
