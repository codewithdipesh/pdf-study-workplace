"use client";

import { createBrowserClient } from "@supabase/ssr";

let browserClient: any;

export function createSupabaseBrowserClient() {
  if (!browserClient) {
    browserClient = createBrowserClient<any>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }

  return browserClient;
}
