import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://hazvuskpuyudotqqdtoy.supabase.co",
  "sb_publishable_Wx5r2rS9PXLLNkBNcXHjVg_C2O_kNtd",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

