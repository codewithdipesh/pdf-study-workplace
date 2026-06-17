import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UploadClient } from "@/components/upload/upload-client";

export default async function UploadPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return <UploadClient userId={data.user?.id ?? null} />;
}
