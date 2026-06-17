import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import type { Database } from "@/types/database";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  const [{ data: pdfs }, { data: positions }] = await Promise.all([
    supabase
      .from("pdfs")
      .select("id,title,file_url,total_pages,created_at")
      .order("created_at", { ascending: false }),
    supabase.from("reading_position").select("pdf_id,last_page,updated_at"),
  ]);

  const pdfIds = (pdfs ?? []).map((item) => item.id);
  const [{ data: chapters }, { data: progress }] = await Promise.all([
    pdfIds.length
      ? supabase.from("chapters").select("id,pdf_id,title,start_page,end_page").in("pdf_id", pdfIds)
      : Promise.resolve({ data: [] as unknown[] }),
    pdfIds.length
      ? supabase.from("progress").select("chapter_id,completed").eq("user_id", user?.id ?? "")
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  return (
    <DashboardClient
      userId={user?.id ?? null}
      initialPdfs={(pdfs ?? []) as Database["public"]["Tables"]["pdfs"]["Row"][]}
      initialPositions={(positions ?? []) as Database["public"]["Tables"]["reading_position"]["Row"][]}
      initialChapters={(chapters ?? []) as Database["public"]["Tables"]["chapters"]["Row"][]}
      initialProgress={(progress ?? []) as Database["public"]["Tables"]["progress"]["Row"][]}
    />
  );
}
