# ResellAgent Supabase Schema & Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create all 5 database tables with RLS, then insert 2 bundles and 33 items as seed data.

**Architecture:** DDL runs once via Supabase SQL Editor (REST API does not support DDL with the service role key). Seed inserts and verification run via a Node.js script using `@supabase/supabase-js` with the service role key.

**Tech Stack:** Node.js 24, @supabase/supabase-js v2, dotenv

> ⚠️ **Category mismatch in spec**: Seed data uses `"Books"`, `"Crafts"`, `"Art"`, `"Sporting Goods"` but the schema CHECK constraint only allows `'Toys & Hobbies','Sports Memorabilia','Collectibles','Entertainment Memorabilia','Books & Media','Other'`. The seed script maps them: Books→Books & Media, Crafts/Art/Sporting Goods→Other.

---

### Task 1: Create migration SQL file

**Files:**
- Create: `supabase/migrations/20260515000000_initial_schema.sql`

- [ ] **Step 1: Write migration file**

Create `supabase/migrations/20260515000000_initial_schema.sql` with the full DDL (already done — see that file).

- [ ] **Step 2: Run it in Supabase SQL Editor**

Open: https://supabase.com/dashboard/project/ksriikistbnlyoczhygo/sql/new

Paste the full contents of `supabase/migrations/20260515000000_initial_schema.sql` and click Run.

- [ ] **Step 3: Confirm tables exist**

In SQL Editor, run:
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
```
Expected: `bundles`, `items`, `messages`, `notifications`, `push_subscriptions`

---

### Task 2: Bootstrap Node.js project and install dependencies

**Files:**
- Create: `package.json`
- Create: `scripts/setup-db.mjs`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "resell-agent",
  "type": "module",
  "private": true,
  "scripts": {
    "setup-db": "node scripts/setup-db.mjs"
  }
}
```

- [ ] **Step 2: Install supabase-js and dotenv**

```bash
npm install @supabase/supabase-js dotenv
```

Expected output: `added X packages` with no errors.

---

### Task 3: Write and run seed script

**Files:**
- Create: `scripts/setup-db.mjs`

- [ ] **Step 1: Write the seed script** (full code in that file — see scripts/setup-db.mjs)

- [ ] **Step 2: Run the script**

```bash
node scripts/setup-db.mjs
```

Expected output:
```
✓ Connected to Supabase
✓ Inserted 2 bundles
✓ Inserted 33 items

--- Verification ---
bundles COUNT: 2
items COUNT: 33
items with bundle_id COUNT: 13
✓ All counts match
```

- [ ] **Step 3: If item inserts fail with foreign key error**

Ensure bundles were inserted first (the script handles ordering, but double-check the output).

- [ ] **Step 4: If any inserts fail with CHECK constraint error**

The category mapping in the script handles the mismatched values. Check the error message for which item failed and which column.

---

### Task 4: Commit

- [ ] **Step 1: Stage and commit**

```bash
git add supabase/migrations/20260515000000_initial_schema.sql scripts/setup-db.mjs package.json package-lock.json
git commit -m "feat: add initial Supabase schema and seed data"
```
