# Cloudinary Bulk Upload UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React upload component with Desktop (drag-drop folder batch) and Mobile (session-based) modes that upload photos to Cloudinary and trigger the Vision pipeline.

**Architecture:** Vite + React + TypeScript frontend scaffolded at project root. Upload logic uses the Cloudinary unsigned REST API directly from the browser (gives full control over `public_id` naming and batch grouping). The `useCloudinaryUpload` hook manages all upload state; four components render the two modes. The Cloudinary Upload Widget script is loaded from CDN as a convenience fallback but all Mode A/B uploads use fetch + FormData for precise folder/naming control.

**Tech Stack:** Vite 5, React 18, TypeScript, Tailwind CSS v3, shadcn/ui, Cloudinary unsigned upload REST API, `crypto.randomUUID()` for batch IDs.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `package.json` | Add React/Vite/Tailwind deps and scripts |
| Create | `vite.config.ts` | Vite config with React plugin |
| Create | `tsconfig.json` | TypeScript config |
| Create | `tsconfig.node.json` | TypeScript config for vite.config |
| Create | `tailwind.config.ts` | Tailwind with shadcn/ui preset |
| Create | `postcss.config.js` | PostCSS for Tailwind |
| Create | `index.html` | Vite entry HTML |
| Create | `src/main.tsx` | React root mount |
| Create | `src/App.tsx` | App shell (renders UploadPage) |
| Create | `src/index.css` | Tailwind directives + shadcn CSS vars |
| Create | `components.json` | shadcn/ui config |
| Create | `src/lib/utils.ts` | shadcn cn() utility |
| Create | `src/components/ui/` | shadcn primitives (button, card, badge, progress, tabs) |
| Create | `src/hooks/useCloudinaryUpload.ts` | Shared upload logic |
| Create | `src/components/upload/UploadProgress.tsx` | Per-item + overall progress bar |
| Create | `src/components/upload/BatchUpload.tsx` | Mode A: drag-drop desktop |
| Create | `src/components/upload/MobileUpload.tsx` | Mode B: New Item session |
| Create | `src/components/upload/UploadPage.tsx` | Mode toggle + page shell |

---

### Task 0: Scaffold Vite + React + TypeScript

**Files:**
- Modify: `package.json`
- Create: `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`

- [ ] **Step 0.1: Install frontend dependencies**

Run from `/home/collen/ReSell-Agent`:
```bash
npm install react react-dom
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom
```

Expected: packages added, no errors.

- [ ] **Step 0.2: Replace `package.json` scripts section**

Open `package.json`. The current content is:
```json
{
  "name": "resell-agent",
  "type": "module",
  "private": true,
  "scripts": {
    "setup-db": "node scripts/setup-db.mjs"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.105.4"
  }
}
```

Add the Vite scripts (keep `setup-db`). The full `scripts` block should become:
```json
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "setup-db": "node scripts/setup-db.mjs"
}
```

- [ ] **Step 0.3: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 0.4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 0.5: Create `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 0.6: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ResellAgent</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 0.7: Create `src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 0.8: Create `src/App.tsx`** (placeholder — will be replaced in Task 6)

```tsx
export default function App() {
  return <div className="min-h-screen bg-background text-foreground p-4">Loading...</div>
}
```

- [ ] **Step 0.9: Verify Vite starts**

Run: `npm run dev`
Expected: "Local: http://localhost:5173/" in terminal, browser shows "Loading...".
Stop the server (Ctrl+C).

- [ ] **Step 0.10: Commit**

```bash
git add package.json vite.config.ts tsconfig.json tsconfig.node.json index.html src/main.tsx src/App.tsx
git commit -m "feat: scaffold Vite + React + TypeScript frontend"
```

---

### Task 1: Add Tailwind CSS + shadcn/ui

**Files:**
- Create: `tailwind.config.ts`, `postcss.config.js`, `src/index.css`, `components.json`
- Create: `src/lib/utils.ts`

- [ ] **Step 1.1: Install Tailwind and shadcn dependencies**

```bash
npm install -D tailwindcss postcss autoprefixer
npm install class-variance-authority clsx tailwind-merge lucide-react
npm install @radix-ui/react-progress @radix-ui/react-tabs @radix-ui/react-slot
```

Expected: packages installed, no errors.

- [ ] **Step 1.2: Create `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 1.3: Create `postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 1.4: Create `src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --ring: 212.7 26.8% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **Step 1.5: Create `src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 1.6: Create shadcn Button component at `src/components/ui/button.tsx`**

```tsx
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
```

- [ ] **Step 1.7: Create shadcn Card at `src/components/ui/card.tsx`**

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)} {...props} />
  )
)
Card.displayName = 'Card'

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  )
)
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-2xl font-semibold leading-none tracking-tight', className)} {...props} />
  )
)
CardTitle.displayName = 'CardTitle'

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
)
CardContent.displayName = 'CardContent'

export { Card, CardHeader, CardTitle, CardContent }
```

- [ ] **Step 1.8: Create shadcn Progress at `src/components/ui/progress.tsx`**

```tsx
import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cn } from '@/lib/utils'

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn('relative h-4 w-full overflow-hidden rounded-full bg-secondary', className)}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-primary transition-all"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
```

- [ ] **Step 1.9: Create shadcn Tabs at `src/components/ui/tabs.tsx`**

```tsx
import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn('inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground', className)}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn('mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', className)}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
```

- [ ] **Step 1.10: Create shadcn Badge at `src/components/ui/badge.tsx`**

```tsx
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
```

- [ ] **Step 1.11: Verify Tailwind works — update `src/App.tsx`**

```tsx
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
```

Run: `npm run dev`
Expected: Card with "ResellAgent" title and a styled button visible at localhost:5173. Stop server.

- [ ] **Step 1.12: Commit**

```bash
git add tailwind.config.ts postcss.config.js src/index.css src/lib/utils.ts src/components/ui/ src/App.tsx
git commit -m "feat: add Tailwind CSS and shadcn/ui primitives"
```

---

### Task 2: `useCloudinaryUpload` hook

**Files:**
- Create: `src/hooks/useCloudinaryUpload.ts`

This hook manages all upload state and the direct Cloudinary REST API calls. It is used by both BatchUpload and MobileUpload.

- [ ] **Step 2.1: Create `src/hooks/useCloudinaryUpload.ts`**

```ts
import { useState, useCallback, useRef } from 'react'

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string
const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`

export type PhotoStatus = 'pending' | 'uploading' | 'done' | 'error'

export interface UploadedPhoto {
  publicId: string
  secureUrl: string
  thumbnailUrl: string
}

export interface ItemUploadState {
  itemName: string
  totalFiles: number
  uploadedCount: number
  failedCount: number
  status: PhotoStatus
  photos: UploadedPhoto[]
  error?: string
}

export interface BatchState {
  batchId: string
  items: Record<string, ItemUploadState>
  overallStatus: 'idle' | 'uploading' | 'done' | 'error'
  triggerStatus: 'idle' | 'pending' | 'success' | 'error'
  triggerError?: string
}

function makeThumbnailUrl(secureUrl: string): string {
  return secureUrl.replace('/upload/', '/upload/w_120,h_120,c_fill/')
}

async function uploadFile(
  file: File,
  publicId: string,
  onProgress: (pct: number) => void
): Promise<UploadedPhoto> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const form = new FormData()
    form.append('file', file)
    form.append('upload_preset', UPLOAD_PRESET)
    form.append('public_id', publicId)

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText)
        resolve({
          publicId: data.public_id,
          secureUrl: data.secure_url,
          thumbnailUrl: makeThumbnailUrl(data.secure_url),
        })
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`))
      }
    })

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
    xhr.open('POST', UPLOAD_URL)
    xhr.send(form)
  })
}

async function triggerVisionPipeline(batchId: string): Promise<void> {
  const res = await fetch('/api/vision/trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch_id: batchId }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Vision trigger failed (${res.status}): ${text}`)
  }
}

export function useCloudinaryUpload() {
  const [batch, setBatch] = useState<BatchState | null>(null)
  const abortRef = useRef(false)

  const initBatch = useCallback((): string => {
    const batchId = crypto.randomUUID()
    setBatch({
      batchId,
      items: {},
      overallStatus: 'idle',
      triggerStatus: 'idle',
    })
    abortRef.current = false
    return batchId
  }, [])

  const uploadItem = useCallback(
    async (
      batchId: string,
      itemName: string,
      files: File[]
    ): Promise<void> => {
      const itemKey = itemName

      setBatch((prev) =>
        prev
          ? {
              ...prev,
              items: {
                ...prev.items,
                [itemKey]: {
                  itemName,
                  totalFiles: files.length,
                  uploadedCount: 0,
                  failedCount: 0,
                  status: 'uploading',
                  photos: [],
                },
              },
            }
          : prev
      )

      const photos: UploadedPhoto[] = []
      let failedCount = 0

      for (let i = 0; i < files.length; i++) {
        if (abortRef.current) break
        const file = files[i]
        const publicId = `resell-agent/${batchId}/${itemName}/${i}`
        try {
          const photo = await uploadFile(file, publicId, () => {})
          photos.push(photo)
          setBatch((prev) =>
            prev
              ? {
                  ...prev,
                  items: {
                    ...prev.items,
                    [itemKey]: {
                      ...prev.items[itemKey],
                      uploadedCount: photos.length,
                      photos: [...photos],
                    },
                  },
                }
              : prev
          )
        } catch {
          failedCount++
          setBatch((prev) =>
            prev
              ? {
                  ...prev,
                  items: {
                    ...prev.items,
                    [itemKey]: {
                      ...prev.items[itemKey],
                      failedCount,
                    },
                  },
                }
              : prev
          )
        }
      }

      setBatch((prev) =>
        prev
          ? {
              ...prev,
              items: {
                ...prev.items,
                [itemKey]: {
                  ...prev.items[itemKey],
                  status: failedCount === files.length ? 'error' : 'done',
                  error: failedCount > 0 ? `${failedCount} file(s) failed` : undefined,
                },
              },
            }
          : prev
      )
    },
    []
  )

  const uploadBatch = useCallback(
    async (items: Array<{ name: string; files: File[] }>): Promise<void> => {
      const batchId = initBatch()

      setBatch((prev) => (prev ? { ...prev, overallStatus: 'uploading' } : prev))

      for (const item of items) {
        if (abortRef.current) break
        await uploadItem(batchId, item.name, item.files)
      }

      setBatch((prev) => (prev ? { ...prev, overallStatus: 'done' } : prev))

      // Trigger vision pipeline
      setBatch((prev) => (prev ? { ...prev, triggerStatus: 'pending' } : prev))
      try {
        await triggerVisionPipeline(batchId)
        setBatch((prev) => (prev ? { ...prev, triggerStatus: 'success' } : prev))
      } catch (err) {
        setBatch((prev) =>
          prev
            ? {
                ...prev,
                triggerStatus: 'error',
                triggerError: err instanceof Error ? err.message : 'Unknown error',
              }
            : prev
        )
      }
    },
    [initBatch, uploadItem]
  )

  const reset = useCallback(() => {
    abortRef.current = true
    setBatch(null)
  }, [])

  const overallPercent = batch
    ? (() => {
        const items = Object.values(batch.items)
        if (items.length === 0) return 0
        const total = items.reduce((s, i) => s + i.totalFiles, 0)
        const done = items.reduce((s, i) => s + i.uploadedCount, 0)
        return total === 0 ? 0 : Math.round((done / total) * 100)
      })()
    : 0

  return { batch, uploadBatch, uploadItem, initBatch, reset, overallPercent }
}
```

- [ ] **Step 2.2: Commit**

```bash
git add src/hooks/useCloudinaryUpload.ts
git commit -m "feat: add useCloudinaryUpload hook with Cloudinary REST API"
```

---

### Task 3: `UploadProgress` component

**Files:**
- Create: `src/components/upload/UploadProgress.tsx`

- [ ] **Step 3.1: Create `src/components/upload/UploadProgress.tsx`**

```tsx
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { ItemUploadState } from '@/hooks/useCloudinaryUpload'

interface ItemProgressProps {
  item: ItemUploadState
}

export function ItemProgress({ item }: ItemProgressProps) {
  const pct = item.totalFiles === 0 ? 0 : Math.round((item.uploadedCount / item.totalFiles) * 100)

  const variant =
    item.status === 'error'
      ? 'destructive'
      : item.status === 'done'
      ? 'default'
      : 'secondary'

  const label =
    item.status === 'done'
      ? 'Done'
      : item.status === 'error'
      ? 'Error'
      : item.status === 'uploading'
      ? `${item.uploadedCount}/${item.totalFiles}`
      : 'Pending'

  return (
    <Card className="mb-2">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium truncate max-w-[60%]">{item.itemName}</span>
          <Badge variant={variant}>{label}</Badge>
        </div>
        <Progress value={pct} className="h-2" />
        {item.error && <p className="text-xs text-destructive mt-1">{item.error}</p>}
        {item.photos.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {item.photos.slice(0, 8).map((p) => (
              <img
                key={p.publicId}
                src={p.thumbnailUrl}
                alt=""
                className="w-10 h-10 object-cover rounded"
              />
            ))}
            {item.photos.length > 8 && (
              <span className="text-xs text-muted-foreground self-center">+{item.photos.length - 8}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface OverallProgressProps {
  percent: number
  triggerStatus: 'idle' | 'pending' | 'success' | 'error'
  triggerError?: string
  itemCount: number
  doneCount: number
}

export function OverallProgress({ percent, triggerStatus, triggerError, itemCount, doneCount }: OverallProgressProps) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">Overall Progress</span>
        <span className="text-sm text-muted-foreground">{doneCount}/{itemCount} items · {percent}%</span>
      </div>
      <Progress value={percent} className="h-3" />
      {triggerStatus === 'pending' && (
        <p className="text-xs text-muted-foreground mt-2">Triggering vision pipeline...</p>
      )}
      {triggerStatus === 'success' && (
        <p className="text-xs text-green-600 dark:text-green-400 mt-2">Vision pipeline triggered successfully.</p>
      )}
      {triggerStatus === 'error' && (
        <p className="text-xs text-destructive mt-2">Pipeline trigger failed: {triggerError}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 3.2: Commit**

```bash
git add src/components/upload/UploadProgress.tsx
git commit -m "feat: add UploadProgress shared component"
```

---

### Task 4: `BatchUpload` component (Mode A — Desktop)

**Files:**
- Create: `src/components/upload/BatchUpload.tsx`

The drag-drop zone uses `DataTransferItem.webkitGetAsEntry()` to read folder structure. Files dragged directly (not in folders) are grouped under an auto-generated item name. An `<input type="file" multiple accept="image/*">` fallback is provided for click-to-select. Each top-level folder becomes one item.

- [ ] **Step 4.1: Create `src/components/upload/BatchUpload.tsx`**

```tsx
import { useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { OverallProgress, ItemProgress } from './UploadProgress'
import { useCloudinaryUpload } from '@/hooks/useCloudinaryUpload'
import { UploadCloud } from 'lucide-react'

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILES = 1200

interface FolderItem {
  name: string
  files: File[]
}

async function readEntries(entry: FileSystemDirectoryEntry): Promise<File[]> {
  return new Promise((resolve) => {
    const reader = entry.createReader()
    const files: File[] = []
    const readBatch = () => {
      reader.readEntries((entries) => {
        if (entries.length === 0) {
          resolve(files)
          return
        }
        const promises = entries.map((e) => {
          if (e.isFile) {
            return new Promise<void>((res) => {
              ;(e as FileSystemFileEntry).file((f) => {
                if (ACCEPTED.includes(f.type)) files.push(f)
                res()
              })
            })
          }
          return Promise.resolve()
        })
        Promise.all(promises).then(readBatch)
      })
    }
    readBatch()
  })
}

async function extractFolderItems(dataTransfer: DataTransfer): Promise<FolderItem[]> {
  const items = Array.from(dataTransfer.items)
  const folderMap: Record<string, File[]> = {}

  await Promise.all(
    items.map(async (item) => {
      const entry = item.webkitGetAsEntry()
      if (!entry) return
      if (entry.isDirectory) {
        const files = await readEntries(entry as FileSystemDirectoryEntry)
        if (files.length > 0) {
          folderMap[entry.name] = files
        }
      } else if (entry.isFile) {
        const file = item.getAsFile()
        if (file && ACCEPTED.includes(file.type)) {
          const key = 'Untitled Item'
          folderMap[key] = [...(folderMap[key] ?? []), file]
        }
      }
    })
  )

  return Object.entries(folderMap).map(([name, files]) => ({ name, files }))
}

export function BatchUpload() {
  const [isDragOver, setIsDragOver] = useState(false)
  const [pendingItems, setPendingItems] = useState<FolderItem[]>([])
  const [validationError, setValidationError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { batch, uploadBatch, overallPercent, reset } = useCloudinaryUpload()

  const validateItems = (items: FolderItem[]): string | null => {
    const total = items.reduce((s, i) => s + i.files.length, 0)
    if (total === 0) return 'No valid image files found.'
    if (total > MAX_FILES) return `Too many files (${total}). Max is ${MAX_FILES}.`
    return null
  }

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    setValidationError(null)
    const items = await extractFolderItems(e.dataTransfer)
    const err = validateItems(items)
    if (err) { setValidationError(err); return }
    setPendingItems(items)
  }, [])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValidationError(null)
    const files = Array.from(e.target.files ?? []).filter((f) => ACCEPTED.includes(f.type))
    if (files.length === 0) { setValidationError('No valid image files selected.'); return }
    if (files.length > MAX_FILES) { setValidationError(`Too many files (${files.length}). Max is ${MAX_FILES}.`); return }
    setPendingItems([{ name: 'Uploaded Photos', files }])
  }, [])

  const handleUpload = useCallback(async () => {
    if (pendingItems.length === 0) return
    await uploadBatch(pendingItems)
  }, [pendingItems, uploadBatch])

  const handleReset = useCallback(() => {
    reset()
    setPendingItems([])
    setValidationError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [reset])

  const isUploading = batch?.overallStatus === 'uploading'
  const isDone = batch?.overallStatus === 'done'
  const itemsMap = batch?.items ?? {}
  const doneCount = Object.values(itemsMap).filter((i) => i.status === 'done').length

  return (
    <div className="space-y-4">
      {!batch && (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
              isDragOver
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          >
            <UploadCloud className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-base font-medium">Drop folders or images here</p>
            <p className="text-sm text-muted-foreground mt-1">Each folder becomes one item · JPG, PNG, WebP · up to 1,200 photos</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>

          {validationError && (
            <p className="text-sm text-destructive">{validationError}</p>
          )}

          {pendingItems.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm font-medium mb-2">
                  Ready to upload {pendingItems.length} item(s) ·{' '}
                  {pendingItems.reduce((s, i) => s + i.files.length, 0)} photos
                </p>
                <ul className="space-y-1 mb-4">
                  {pendingItems.map((item) => (
                    <li key={item.name} className="text-sm flex justify-between">
                      <span className="truncate">{item.name}</span>
                      <span className="text-muted-foreground ml-2">{item.files.length} photos</span>
                    </li>
                  ))}
                </ul>
                <Button onClick={handleUpload} className="w-full">Start Upload</Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {batch && (
        <div>
          <OverallProgress
            percent={overallPercent}
            triggerStatus={batch.triggerStatus}
            triggerError={batch.triggerError}
            itemCount={Object.keys(itemsMap).length}
            doneCount={doneCount}
          />
          <div className="max-h-[50vh] overflow-y-auto space-y-2">
            {Object.values(itemsMap).map((item) => (
              <ItemProgress key={item.itemName} item={item} />
            ))}
          </div>
          {isDone && (
            <Button variant="outline" onClick={handleReset} className="mt-4 w-full">
              Start New Batch
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4.2: Commit**

```bash
git add src/components/upload/BatchUpload.tsx
git commit -m "feat: add BatchUpload desktop drag-drop component (Mode A)"
```

---

### Task 5: `MobileUpload` component (Mode B — Mobile Session)

**Files:**
- Create: `src/components/upload/MobileUpload.tsx`

Each "New Item" tap creates a session boundary. Photos captured after the tap belong to that session. Sessions accumulate until the user taps "Upload All Sessions".

- [ ] **Step 5.1: Create `src/components/upload/MobileUpload.tsx`**

```tsx
import { useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { OverallProgress, ItemProgress } from './UploadProgress'
import { useCloudinaryUpload } from '@/hooks/useCloudinaryUpload'
import { Camera, Plus } from 'lucide-react'

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

interface Session {
  id: string
  name: string
  files: File[]
  previews: string[]
}

let sessionCounter = 1

export function MobileUpload() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const { batch, uploadBatch, overallPercent, reset } = useCloudinaryUpload()

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null

  const handleNewItem = useCallback(() => {
    const id = crypto.randomUUID()
    const name = `Item ${sessionCounter++}`
    setSessions((prev) => [...prev, { id, name, files: [], previews: [] }])
    setActiveSessionId(id)
  }, [])

  const handleCameraCapture = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!activeSessionId) return
      const files = Array.from(e.target.files ?? []).filter((f) => ACCEPTED.includes(f.type))
      if (files.length === 0) return

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== activeSessionId) return s
          const previews = files.map((f) => URL.createObjectURL(f))
          return { ...s, files: [...s.files, ...files], previews: [...s.previews, ...previews] }
        })
      )

      if (cameraInputRef.current) cameraInputRef.current.value = ''
    },
    [activeSessionId]
  )

  const handleUploadAll = useCallback(async () => {
    const items = sessions.filter((s) => s.files.length > 0).map((s) => ({ name: s.name, files: s.files }))
    if (items.length === 0) return
    await uploadBatch(items)
  }, [sessions, uploadBatch])

  const handleReset = useCallback(() => {
    sessions.forEach((s) => s.previews.forEach((url) => URL.revokeObjectURL(url)))
    reset()
    setSessions([])
    setActiveSessionId(null)
    sessionCounter = 1
  }, [sessions, reset])

  const isUploading = batch?.overallStatus === 'uploading'
  const isDone = batch?.overallStatus === 'done'
  const totalPhotos = sessions.reduce((s, sess) => s + sess.files.length, 0)

  if (batch) {
    const itemsMap = batch.items
    const doneCount = Object.values(itemsMap).filter((i) => i.status === 'done').length
    return (
      <div className="space-y-4">
        <OverallProgress
          percent={overallPercent}
          triggerStatus={batch.triggerStatus}
          triggerError={batch.triggerError}
          itemCount={Object.keys(itemsMap).length}
          doneCount={doneCount}
        />
        <div className="max-h-[50vh] overflow-y-auto space-y-2">
          {Object.values(itemsMap).map((item) => (
            <ItemProgress key={item.itemName} item={item} />
          ))}
        </div>
        {isDone && (
          <Button variant="outline" onClick={handleReset} className="w-full">
            Start New Session
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* New Item button */}
      <Button
        onClick={handleNewItem}
        size="lg"
        className="w-full h-16 text-lg gap-2"
      >
        <Plus className="h-6 w-6" />
        New Item
      </Button>

      {/* Active session status */}
      {activeSession && (
        <Card className="border-primary">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-medium">{activeSession.name}</p>
                <p className="text-sm text-muted-foreground">{activeSession.files.length} photo(s)</p>
              </div>
              <Badge>Active</Badge>
            </div>
            {/* Thumbnail strip */}
            {activeSession.previews.length > 0 && (
              <div className="flex gap-1 overflow-x-auto pb-1 mb-3">
                {activeSession.previews.slice(-8).map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt=""
                    className="w-14 h-14 object-cover rounded flex-shrink-0"
                  />
                ))}
              </div>
            )}
            {/* Camera trigger */}
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera className="h-4 w-4" />
              Add Photos
            </Button>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={handleCameraCapture}
            />
          </CardContent>
        </Card>
      )}

      {/* All sessions list */}
      {sessions.length > 0 && (
        <div className="space-y-2">
          {sessions.map((session) => (
            <Card
              key={session.id}
              className={`cursor-pointer transition-colors ${session.id === activeSessionId ? 'border-primary' : ''}`}
              onClick={() => setActiveSessionId(session.id)}
            >
              <CardContent className="pt-3 pb-3 flex items-center justify-between">
                <span className="text-sm font-medium">{session.name}</span>
                <span className="text-sm text-muted-foreground">{session.files.length} photos</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Upload all button */}
      {totalPhotos > 0 && (
        <Button
          onClick={handleUploadAll}
          className="w-full"
          disabled={isUploading}
        >
          Upload All ({sessions.length} items · {totalPhotos} photos)
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 5.2: Commit**

```bash
git add src/components/upload/MobileUpload.tsx
git commit -m "feat: add MobileUpload session-based component (Mode B)"
```

---

### Task 6: `UploadPage` with mode toggle + wire `App.tsx`

**Files:**
- Create: `src/components/upload/UploadPage.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 6.1: Create `src/components/upload/UploadPage.tsx`**

```tsx
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
```

- [ ] **Step 6.2: Replace `src/App.tsx`**

```tsx
import { UploadPage } from '@/components/upload/UploadPage'

export default function App() {
  return <UploadPage />
}
```

- [ ] **Step 6.3: Commit**

```bash
git add src/components/upload/UploadPage.tsx src/App.tsx
git commit -m "feat: add UploadPage with Desktop/Mobile tab toggle"
```

---

### Task 7: Verify the full app runs locally

- [ ] **Step 7.1: Verify `.env` has required Cloudinary keys**

Open `.env` and confirm these two lines are present and filled in:
```
VITE_CLOUDINARY_CLOUD_NAME=<your-cloud-name>
VITE_CLOUDINARY_UPLOAD_PRESET=resell-agent-unsigned
```

If `VITE_CLOUDINARY_CLOUD_NAME` is empty/pending, you must fill it in with your Cloudinary cloud name before uploads will work. Get it from the Cloudinary Dashboard → top-right account dropdown.

- [ ] **Step 7.2: Start the dev server**

```bash
npm run dev
```

Expected output:
```
  VITE v5.x.x  ready in xxx ms
  ➜  Local:   http://localhost:5173/
```

- [ ] **Step 7.3: Smoke test Desktop mode**

1. Open http://localhost:5173
2. Confirm "ResellAgent" heading and two tabs appear.
3. The "Desktop Batch" tab should be active by default.
4. Confirm the drag-drop zone renders with cloud icon.
5. Click the zone — file picker opens.
6. Select 2–3 image files. Confirm they appear in the "Ready to upload" card.
7. Click "Start Upload". Confirm progress bars animate.
8. After upload completes, confirm thumbnails appear in the item card.
9. Confirm "Vision pipeline triggered" message appears (it will likely show an error since `/api/vision/trigger` doesn't exist — that's expected).

- [ ] **Step 7.4: Smoke test Mobile mode**

1. Click the "Mobile Session" tab.
2. Tap "New Item" — confirm an "Item 1 · Active" card appears.
3. Click "Add Photos" — confirm file picker opens.
4. Select images — confirm thumbnails appear in the session card.
5. Tap "New Item" again — confirm "Item 2" card appears.
6. Tap "Upload All" — confirm upload begins for both sessions.

- [ ] **Step 7.5: Final commit**

```bash
git add -A
git commit -m "feat: complete Cloudinary upload UI with Desktop and Mobile modes"
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|---|---|
| Mode A drag-drop zone, folder = item | Task 4 |
| Mode A folder name as item name seed | Task 4 — `entry.name` used as item key |
| Upload progress per folder | Task 3 — `ItemProgress` |
| Image-only accept (jpg/jpeg/png/webp) | Task 4 — `ACCEPTED` list + `accept` attr |
| Up to 1,200 photos per session | Task 4 — `MAX_FILES = 1200` |
| Cloudinary Upload Widget | Note: spec says "Widget" but mode requires custom folder grouping not supported by modal widget. Plan uses direct Cloudinary REST API (unsigned) which is the underlying mechanism the widget uses. The CDN widget script is not loaded since the REST API approach covers all requirements. |
| `public_id` naming `{batch_id}/{folder}/{index}` | Task 2 — `resell-agent/${batchId}/${itemName}/${i}` |
| Mode B "New Item" button | Task 5 |
| Mode B session_id boundary | Task 5 — `crypto.randomUUID()` per session |
| Show current session name + count | Task 5 — active session card |
| Unique batch_id (UUID) | Task 2 — `initBatch()` |
| Visual progress bar per item + overall | Task 3 |
| Thumbnail preview of uploaded photos | Task 3 — thumbnail strip in `ItemProgress` |
| POST /api/vision/trigger on complete | Task 2 — `triggerVisionPipeline()` |
| Success/error state display | Task 3 |
| shadcn/ui throughout | Tasks 1, 3–6 |
| Tailwind styling | Tasks 1, 3–6 |
| Mobile-responsive | Task 5 — full-width stacked layout |
| Mode toggle tabs | Task 6 |
| Dark mode compatible | Task 1 — CSS vars with `.dark` class |
| TypeScript throughout | All tasks |
| `import.meta.env` for env vars | Task 2 |
| No server-side Cloudinary SDK | All tasks — browser-only |

### Placeholder Scan

No TBD, TODO, or "similar to Task N" references found.

### Type Consistency

- `ItemUploadState` defined in `useCloudinaryUpload.ts` (Task 2), used in `UploadProgress.tsx` (Task 3) via import — consistent.
- `BatchState.triggerStatus` values: `'idle' | 'pending' | 'success' | 'error'` — used consistently in Task 2 and Task 3.
- `OverallProgress` props match what `BatchUpload` and `MobileUpload` pass — verified.
