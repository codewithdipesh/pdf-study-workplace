"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { ArrowRight, BookOpen, Clock3, FileText, Search, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDate, formatPercent } from "@/lib/utils";

type PdfRow = {
  id: string;
  title: string;
  file_url: string;
  total_pages: number;
  created_at: string;
};

type ChapterRow = {
  id: string;
  pdf_id: string;
  title: string;
  start_page: number;
  end_page: number;
};

type ProgressRow = {
  chapter_id: string;
  completed: boolean;
};

type PositionRow = {
  pdf_id: string;
  last_page: number;
  updated_at: string;
};

function getCompletion(pdfId: string, chapters: ChapterRow[], progress: ProgressRow[]) {
  const pdfChapters = chapters.filter((chapter) => chapter.pdf_id === pdfId);
  if (!pdfChapters.length) return 0;
  const completed = pdfChapters.filter((chapter) => progress.some((entry) => entry.chapter_id === chapter.id && entry.completed)).length;
  return (completed / pdfChapters.length) * 100;
}

function PdfCard({
  pdf,
  chapters,
  progress,
  position,
}: {
  pdf: PdfRow;
  chapters: ChapterRow[];
  progress: ProgressRow[];
  position?: PositionRow;
}) {
  const completion = getCompletion(pdf.id, chapters, progress);
  const nextPage = position?.last_page ?? 1;

  return (
    <Card className="group overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Badge variant={completion === 100 ? "success" : "secondary"}>{formatPercent(completion)} complete</Badge>
            <CardTitle className="line-clamp-2 font-heading text-xl">{pdf.title}</CardTitle>
            <CardDescription>
              {pdf.total_pages} pages · Opened {formatDate(position?.updated_at ?? pdf.created_at)}
            </CardDescription>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FileText className="h-5 w-5" />
          </div>
        </div>
        <Progress value={completion} />
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <div className="space-y-1 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4" />
            Last page {nextPage}
          </div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            {chapters.filter((chapter) => chapter.pdf_id === pdf.id).length || 0} chapters
          </div>
        </div>
        <Button asChild className="rounded-2xl">
          <Link href={`/reader/${pdf.id}`}>
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function DashboardClient({
  initialPdfs,
  initialChapters,
  initialProgress,
  initialPositions,
}: {
  userId: string | null;
  initialPdfs: PdfRow[];
  initialChapters: ChapterRow[];
  initialProgress: ProgressRow[];
  initialPositions: PositionRow[];
}) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const filtered = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) return initialPdfs;
    return initialPdfs.filter((pdf) => pdf.title.toLowerCase().includes(query));
  }, [deferredSearch, initialPdfs]);

  return (
    <AppShell search={search} setSearch={setSearch}>
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-[1.4fr_0.8fr]">
          <Card className="relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.12),transparent_35%)]" />
            <CardHeader className="relative">
              <Badge className="w-fit">Study workspace</Badge>
              <CardTitle className="max-w-xl font-heading text-3xl">Continue exactly where you left off.</CardTitle>
              <CardDescription className="max-w-2xl text-base">
                Track progress, capture notes, mark chapters complete, and return to the right page on every device.
              </CardDescription>
            </CardHeader>
            <CardContent className="relative flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-2xl">
                <Link href="/upload">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Upload PDF
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-2xl">
                <Link href={filtered[0] ? `/reader/${filtered[0].id}` : "/upload"}>Open latest</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card/80">
            <CardHeader>
              <CardTitle className="font-heading">Overview</CardTitle>
              <CardDescription>Fast context for your active library</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3 md:grid-cols-1">
              <div className="rounded-2xl border border-border bg-background p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">PDFs</div>
                <div className="mt-2 text-2xl font-semibold">{initialPdfs.length}</div>
              </div>
              <div className="rounded-2xl border border-border bg-background p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Notes-ready</div>
                <div className="mt-2 text-2xl font-semibold">{initialChapters.length}</div>
              </div>
              <div className="rounded-2xl border border-border bg-background p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Active pages</div>
                <div className="mt-2 text-2xl font-semibold">{initialPositions.length}</div>
              </div>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="font-heading">Library</CardTitle>
              <CardDescription>Search your study material and jump back in</CardDescription>
            </div>
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search PDFs" className="h-11 rounded-2xl pl-9" />
            </div>
          </CardHeader>
          <CardContent>
            {filtered.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map((pdf) => (
                  <PdfCard
                    key={pdf.id}
                    pdf={pdf}
                    chapters={initialChapters}
                    progress={initialProgress}
                    position={initialPositions.find((entry) => entry.pdf_id === pdf.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="grid place-items-center rounded-2xl border border-dashed border-border py-20 text-center">
                <div className="max-w-sm space-y-2">
                  <div className="font-heading text-xl">No PDFs match your search</div>
                  <div className="text-sm text-muted-foreground">Upload a book, paper, or documentation set to build your study workspace.</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
