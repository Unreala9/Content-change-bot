import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://ycylbhegnesaqxyfxbpk.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljeWxiaGVnbmVzYXF4eWZ4YnBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5OTg4MTIsImV4cCI6MjEwMTU3NDgxMn0.vG_4Xr9Ig7SgjXwWmdCviJD85qFpsZUTUWXPUH2HjHw";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
