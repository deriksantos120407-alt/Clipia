import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://gclwykwkysbqxvonacmu.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_0PqCkxrzRdcZoOx9mxOHoA_YN-zmeR0";
  return createSupabaseClient(url, key);
}
