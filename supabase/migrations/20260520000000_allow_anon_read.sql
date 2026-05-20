-- Allow anon key (frontend) to read and update items
CREATE POLICY "Allow anon read on items"
  ON items FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon update on items"
  ON items FOR UPDATE TO anon USING (true) WITH CHECK (true);
