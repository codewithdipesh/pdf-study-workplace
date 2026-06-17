import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ReaderClient } from "@/components/reader/reader-client";
import type { Database } from "@/types/database";

export default async function ReaderPage({ params }: { params: Promise<{ pdfId: string }> }) {
  const { pdfId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;

  const [{ data: pdf }, { data: chapters }] = await Promise.all([
    supabase.from("pdfs").select("id,title,file_url,total_pages,created_at").eq("id", pdfId).single(),
    supabase.from("chapters").select("id,pdf_id,title,start_page,end_page").eq("pdf_id", pdfId).order("start_page", { ascending: true }),
  ]);

  const chapterIds = (chapters ?? []).map((item) => item.id);
  const [{ data: progress }, { data: bookmarks }, { data: notes }, { data: readingPosition }, { data: annotations }] = await Promise.all([
    userId && chapterIds.length
      ? supabase.from("progress").select("id,chapter_id,completed,completed_at").eq("user_id", userId).in("chapter_id", chapterIds)
      : Promise.resolve({ data: [] as Database["public"]["Tables"]["progress"]["Row"][] }),
    userId
      ? supabase.from("bookmarks").select("id,pdf_id,page_number,created_at").eq("user_id", userId).eq("pdf_id", pdfId)
      : Promise.resolve({ data: [] as Database["public"]["Tables"]["bookmarks"]["Row"][] }),
    userId
      ? supabase.from("notes").select("id,pdf_id,page_number,content,created_at,updated_at").eq("user_id", userId).eq("pdf_id", pdfId)
      : Promise.resolve({ data: [] as Database["public"]["Tables"]["notes"]["Row"][] }),
    userId
      ? supabase.from("reading_position").select("id,pdf_id,last_page,updated_at").eq("user_id", userId).eq("pdf_id", pdfId).maybeSingle()
      : Promise.resolve({ data: null as Database["public"]["Tables"]["reading_position"]["Row"] | null }),
    userId
      ? supabase.from("annotations").select("id,pdf_id,page_number,data,updated_at").eq("user_id", userId).eq("pdf_id", pdfId)
      : Promise.resolve({ data: [] as Database["public"]["Tables"]["annotations"]["Row"][] }),
  ]);

  if (!pdf) {
    notFound();
  }

  return (
    <ReaderClient
      pdf={pdf as Database["public"]["Tables"]["pdfs"]["Row"]}
      chapters={(chapters ?? []) as Database["public"]["Tables"]["chapters"]["Row"][]}
      progress={(progress ?? []) as Database["public"]["Tables"]["progress"]["Row"][]}
      bookmarks={(bookmarks ?? []) as Database["public"]["Tables"]["bookmarks"]["Row"][]}
      notes={(notes ?? []) as Database["public"]["Tables"]["notes"]["Row"][]}
      readingPosition={(readingPosition ?? null) as Database["public"]["Tables"]["reading_position"]["Row"] | null}
      annotations={(annotations ?? []) as Database["public"]["Tables"]["annotations"]["Row"][]}
      userId={userId ?? ""}
    />
  );
}
