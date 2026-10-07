/* ============================================================
   Dutton Plumbing — Crew Log app configuration
   ------------------------------------------------------------
   Fill in the two values below during setup (see SETUP.md),
   then deploy. That's it — nothing else to configure.

   The anon key is PUBLIC BY DESIGN: it is safe to ship in this
   file. Row Level Security on the crew_logs table means the anon
   key can only INSERT new rows — it cannot read, change, or
   delete anything.
   ============================================================ */

const SUPABASE_URL = "https://ittajrrehfgukynxudlg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0dGFqcnJlaGZndWt5bnh1ZGxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzMzI2NjEsImV4cCI6MjEwNjkwODY2MX0.KnsDeIwYpdRtOB09h2_Su-TseR4mIQNbBljCzJAmN8M";
