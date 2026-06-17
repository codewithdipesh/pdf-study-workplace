"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export async function getCurrentUserId() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const userId = data.user?.id;
  if (!userId) {
    throw new Error("Session expired. Please login again.");
  }
  return userId;
}
