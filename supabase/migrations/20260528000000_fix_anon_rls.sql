-- Drop the overly permissive anon UPDATE policy
DROP POLICY IF EXISTS "Allow anon update on items" ON items;

-- Replace with column-restricted policy (status only)
CREATE POLICY "Allow anon update item status"
  ON items FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Add column-level security: anon can only update status column
-- All other columns require service_role
REVOKE UPDATE ON items FROM anon;
GRANT UPDATE (status) ON items TO anon;
