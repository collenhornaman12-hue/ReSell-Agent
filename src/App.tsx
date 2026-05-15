import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <Card className="max-w-sm">
        <CardHeader><CardTitle>ResellAgent</CardTitle></CardHeader>
        <CardContent><Button>Upload Photos</Button></CardContent>
      </Card>
    </div>
  )
}
