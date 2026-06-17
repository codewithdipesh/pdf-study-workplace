"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Viewer,
  Worker,
  type PageChangeEvent,
  SpecialZoomLevel,
} from "@react-pdf-viewer/core";
import { searchPlugin } from "@react-pdf-viewer/search";
import { pageNavigationPlugin } from "@react-pdf-viewer/page-navigation";
import { thumbnailPlugin, ThumbnailDirection } from "@react-pdf-viewer/thumbnail";
import { zoomPlugin } from "@react-pdf-viewer/zoom";
import { Stage, Layer, Line } from "react-konva";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookMarked, BookmarkPlus, Eraser, Highlighter, Loader2, Pencil, Search, Trash2, Undo2, Redo2, ChevronLeft, ChevronRight, LayoutDashboard, Menu, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ANNOTATION_DEBOUNCE_MS, READER_SAVE_INTERVAL_MS, STORAGE_BUCKET } from "@/lib/constants";
import { cn, formatDate, formatPercent, safeJsonParse } from "@/lib/utils";
import { useReaderStore, type ReaderTool } from "@/store/use-reader-store";

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
  id: string;
  chapter_id: string;
  completed: boolean;
  completed_at: string | null;
};

type NoteRow = {
  id: string;
  pdf_id: string;
  page_number: number;
  content: string;
  created_at: string;
  updated_at: string;
};

type BookmarkRow = {
  id: string;
  pdf_id: string;
  page_number: number;
  created_at: string;
};

type PositionRow = {
  id: string;
  pdf_id: string;
  last_page: number;
  updated_at: string;
};

type AnnotationData = {
  strokes: {
    points: number[];
    color: string;
    width: number;
    opacity: number;
    mode: ReaderTool;
  }[];
};

type AnnotationRow = {
  id: string;
  pdf_id: string;
  page_number: number;
  data: any;
  updated_at: string;
};

function chapterCompletion(chapters: ChapterRow[], progress: ProgressRow[]) {
  if (!chapters.length) return 0;
  const completed = chapters.filter((chapter) => progress.some((item) => item.chapter_id === chapter.id && item.completed)).length;
  return (completed / chapters.length) * 100;
}

function useSignedPdfUrl(fileUrl: string) {
  return useQuery({
    queryKey: ["signed-pdf-url", fileUrl],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(fileUrl, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
    staleTime: 55 * 60 * 1000,
  });
}

function ToolButton({
  active,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { active?: boolean }) {
  return (
    <Button
      {...props}
      variant={active ? "default" : "outline"}
      size="sm"
      className={cn("rounded-xl", props.className)}
    >
      {children}
    </Button>
  );
}

function NotesEditor({
  currentPage,
  pdfId,
  initialNotes,
}: {
  currentPage: number;
  pdfId: string;
  initialNotes: NoteRow[];
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  const notesQuery = useQuery({
    queryKey: ["notes", pdfId, currentPage],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("notes")
        .select("id,pdf_id,page_number,content,created_at,updated_at")
        .eq("pdf_id", pdfId)
        .eq("page_number", currentPage)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as NoteRow[];
    },
    initialData: initialNotes.filter((note) => note.page_number === currentPage),
  });

  useEffect(() => {
    const note = notesQuery.data?.[0];
    setActiveNoteId(note?.id ?? null);
    setDraft(note?.content ?? "");
  }, [currentPage, notesQuery.data]);

  const saveMutation = useMutation<NoteRow, Error, string>({
    mutationFn: async (content: string) => {
      const supabase = createSupabaseBrowserClient();
      if (activeNoteId) {
        const { data, error } = await supabase
          .from("notes")
          .update({ content, updated_at: new Date().toISOString() })
          .eq("id", activeNoteId)
          .select()
          .single();
        if (error) throw error;
        return data as NoteRow;
      }
      const { data, error } = await supabase
        .from("notes")
        .insert({
          pdf_id: pdfId,
          page_number: currentPage,
          content,
        })
        .select()
        .single();
      if (error) throw error;
      return data as NoteRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes", pdfId, currentPage] });
    },
  });

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (noteId) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("notes").delete().eq("id", noteId);
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft("");
      setActiveNoteId(null);
      queryClient.invalidateQueries({ queryKey: ["notes", pdfId, currentPage] });
    },
  });

  useEffect(() => {
    if (!draft && !activeNoteId) return;
    const timeout = window.setTimeout(() => {
      saveMutation.mutate(draft);
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [draft, activeNoteId, saveMutation]);

  const notes = notesQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Page {currentPage} notes</div>
            <div className="text-xs text-muted-foreground">{notes.length} note(s) linked to this page</div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setDraft(""); setActiveNoteId(null); }}>
            New note
          </Button>
        </div>
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write a note for this page..."
          className="min-h-[180px] rounded-2xl"
        />
      </div>
      <div className="space-y-2">
        {notes.map((note) => (
          <Card key={note.id} className={cn("border-border/70", activeNoteId === note.id && "ring-1 ring-primary/40")}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{formatDate(note.updated_at)}</span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setActiveNoteId(note.id); setDraft(note.content); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(note.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="whitespace-pre-wrap text-sm text-foreground">{note.content}</div>
            </CardContent>
          </Card>
        ))}
        {!notes.length ? <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No notes yet on this page.</div> : null}
      </div>
    </div>
  );
}

function BookmarkPanel({
  pdfId,
  currentPage,
  initialBookmarks,
  onJump,
}: {
  pdfId: string;
  currentPage: number;
  initialBookmarks: BookmarkRow[];
  onJump: (page: number) => void;
}) {
  const queryClient = useQueryClient();
  const bookmarksQuery = useQuery({
    queryKey: ["bookmarks", pdfId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("bookmarks")
        .select("id,pdf_id,page_number,created_at")
        .eq("pdf_id", pdfId)
        .order("page_number", { ascending: true });
      if (error) throw error;
      return data as BookmarkRow[];
    },
    initialData: initialBookmarks,
  });

  const toggleMutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const existing = bookmarksQuery.data?.find((item) => item.page_number === currentPage);
      if (existing) {
        const { error } = await supabase.from("bookmarks").delete().eq("id", existing.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("bookmarks").insert({
        pdf_id: pdfId,
        page_number: currentPage,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bookmarks", pdfId] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">Bookmarks</div>
          <div className="text-xs text-muted-foreground">{bookmarksQuery.data?.length ?? 0} saved pages</div>
        </div>
        <Button variant="outline" size="sm" onClick={() => toggleMutation.mutate()}>
          <BookmarkPlus className="mr-2 h-4 w-4" />
          {bookmarksQuery.data?.some((item) => item.page_number === currentPage) ? "Remove" : "Add"}
        </Button>
      </div>
      <div className="space-y-2">
        {bookmarksQuery.data?.map((bookmark) => (
          <button
            key={bookmark.id}
            className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
            onClick={() => onJump(bookmark.page_number)}
          >
            <span>Page {bookmark.page_number}</span>
            <span className="text-xs text-muted-foreground">{formatDate(bookmark.created_at)}</span>
          </button>
        ))}
        {!bookmarksQuery.data?.length ? <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No bookmarks yet.</div> : null}
      </div>
    </div>
  );
}

function ChapterSidebar({
  chapters,
  progress,
  pdfId,
  userId,
  onJump,
}: {
  chapters: ChapterRow[];
  progress: ProgressRow[];
  pdfId: string;
  userId: string;
  onJump: (page: number) => void;
}) {
  const [filter, setFilter] = useState("");
  const queryClient = useQueryClient();
  const progressQuery = useQuery({
    queryKey: ["chapters-progress", pdfId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("progress")
        .select("id,chapter_id,completed,completed_at")
        .eq("user_id", userId)
        .in("chapter_id", chapters.map((chapter) => chapter.id));
      if (error) throw error;
      return data as ProgressRow[];
    },
    initialData: progress,
  });
  const progressRows = progressQuery.data ?? [];
  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return chapters;
    return chapters.filter((chapter) => chapter.title.toLowerCase().includes(query));
  }, [chapters, filter]);

  const toggleMutation = useMutation<void, Error, string>({
    mutationFn: async (chapterId: string) => {
      const supabase = createSupabaseBrowserClient();
      const current = progressRows.find((item) => item.chapter_id === chapterId);
      if (current) {
        const { error } = await supabase.from("progress").update({
          completed: !current.completed,
          completed_at: !current.completed ? new Date().toISOString() : null,
        }).eq("id", current.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("progress").insert({
          chapter_id: chapterId,
          completed: true,
          completed_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chapters-progress", pdfId] }),
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Chapters</div>
            <div className="text-xs text-muted-foreground">{chapters.length} sections</div>
          </div>
          <Badge variant="secondary">{formatPercent(chapterCompletion(chapters, progressRows))}</Badge>
        </div>
        <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search chapters" className="rounded-2xl" />
      </div>
      <div className="space-y-2">
        {filtered.map((chapter) => {
          const completed = progressRows.some((item) => item.chapter_id === chapter.id && item.completed);
          return (
            <div key={chapter.id} className="rounded-2xl border border-border bg-background p-3">
              <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => onJump(chapter.start_page)}>
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className={completed ? "text-emerald-500" : "text-muted-foreground"}>{completed ? "✓" : "○"}</span>
                    <span className="truncate">{chapter.title}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Pages {chapter.start_page} - {chapter.end_page}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{completed ? "Completed" : "Open"}</span>
              </button>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-8 w-full justify-start rounded-xl px-2 text-xs"
                onClick={() => toggleMutation.mutate(chapter.id)}
              >
                {completed ? "Mark incomplete" : "Mark complete"}
              </Button>
            </div>
          );
        })}
        {!filtered.length ? <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No chapters match that search.</div> : null}
      </div>
    </div>
  );
}

function AnnotationCanvas({
  currentPage,
  width,
  height,
  initialAnnotations,
  pdfId,
}: {
  currentPage: number;
  width: number;
  height: number;
  initialAnnotations: AnnotationRow[];
  pdfId: string;
}) {
  const queryClient = useQueryClient();
  const tool = useReaderStore((state) => state.tool);
  const [strokes, setStrokes] = useState<AnnotationData["strokes"]>([]);
  const [redoStack, setRedoStack] = useState<AnnotationData["strokes"]>([]);
  const stageRef = useRef<any>(null);
  const isDrawingRef = useRef(false);

  const currentAnnotation = initialAnnotations.find((item) => item.page_number === currentPage);
  const currentAnnotationData = currentAnnotation?.data as AnnotationData | undefined;

  useEffect(() => {
    setStrokes(currentAnnotationData?.strokes ?? []);
    setRedoStack([]);
  }, [currentAnnotationData, currentPage]);

  const saveMutation = useMutation<void, Error, AnnotationData["strokes"]>({
    mutationFn: async (nextStrokes: AnnotationData["strokes"]) => {
      const supabase = createSupabaseBrowserClient();
      const payload = { strokes: nextStrokes };
      const existing = currentAnnotation;
      if (existing) {
        const { error } = await supabase.from("annotations").update({ data: payload, updated_at: new Date().toISOString() }).eq("id", existing.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("annotations").insert({
        pdf_id: pdfId,
        page_number: currentPage,
        data: payload,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["annotations", pdfId] }),
  });

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      saveMutation.mutate(strokes);
    }, ANNOTATION_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [saveMutation, strokes]);

  function getPoint(event: any) {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    return pointer ? [pointer.x, pointer.y] : [event.evt.offsetX, event.evt.offsetY];
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute left-3 top-3 z-10 pointer-events-auto flex flex-wrap gap-2 rounded-2xl border border-border bg-background/95 p-2 shadow-soft">
        <ToolButton active={tool === "pen"} onClick={() => useReaderStore.getState().setTool("pen")}><Pencil className="mr-2 h-4 w-4" />Pen</ToolButton>
        <ToolButton active={tool === "highlighter"} onClick={() => useReaderStore.getState().setTool("highlighter")}><Highlighter className="mr-2 h-4 w-4" />Highlighter</ToolButton>
        <ToolButton active={tool === "eraser"} onClick={() => useReaderStore.getState().setTool("eraser")}><Eraser className="mr-2 h-4 w-4" />Eraser</ToolButton>
        <Separator orientation="vertical" className="mx-1 h-8" />
        <ToolButton onClick={() => { setStrokes((current) => current.slice(0, -1)); setRedoStack([]); }}><Undo2 className="mr-2 h-4 w-4" />Undo</ToolButton>
        <ToolButton onClick={() => { setRedoStack([]); setStrokes([]); }}><Trash2 className="mr-2 h-4 w-4" />Clear</ToolButton>
        <ToolButton onClick={() => { if (!redoStack.length) return; const item = redoStack[redoStack.length - 1]; setRedoStack((current) => current.slice(0, -1)); setStrokes((current) => [...current, item]); }}><Redo2 className="mr-2 h-4 w-4" />Redo</ToolButton>
      </div>
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        className="absolute inset-0 pointer-events-auto"
        onMouseDown={(event) => {
          isDrawingRef.current = true;
          const [x, y] = getPoint(event);
          const color = tool === "highlighter" ? "#facc15" : tool === "eraser" ? "#ffffff" : "#2563eb";
          const widthValue = tool === "highlighter" ? 18 : 3;
          const opacity = tool === "highlighter" ? 0.25 : 1;
          setStrokes((current) => [...current, { points: [x, y], color, width: widthValue, opacity, mode: tool }]);
        }}
        onMouseMove={(event) => {
          if (!isDrawingRef.current) return;
          const [x, y] = getPoint(event);
          setStrokes((current) => {
            if (!current.length) return current;
            const updated = [...current];
            const last = updated[updated.length - 1];
            updated[updated.length - 1] = { ...last, points: [...last.points, x, y] };
            return updated;
          });
        }}
        onMouseUp={() => {
          isDrawingRef.current = false;
          setRedoStack([]);
        }}
        onMouseLeave={() => {
          isDrawingRef.current = false;
        }}
      >
        <Layer>
          {strokes.map((stroke, index) => (
            <Line
              key={`${index}-${stroke.color}`}
              points={stroke.points}
              stroke={stroke.color}
              strokeWidth={stroke.width}
              tension={0.5}
              lineCap="round"
              lineJoin="round"
              globalCompositeOperation={stroke.mode === "eraser" ? "destination-out" : "source-over"}
              opacity={stroke.opacity}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}

export function ReaderClient({
  pdf,
  chapters,
  progress,
  bookmarks,
  notes,
  readingPosition,
  annotations,
  userId,
}: {
  pdf: PdfRow;
  chapters: ChapterRow[];
  progress: ProgressRow[];
  bookmarks: BookmarkRow[];
  notes: NoteRow[];
  readingPosition: PositionRow | null;
  annotations: AnnotationRow[];
  userId: string;
}) {
  const queryClient = useQueryClient();
  const currentPage = useReaderStore((state) => state.currentPage);
  const setCurrentPage = useReaderStore((state) => state.setCurrentPage);
  const setZoom = useReaderStore((state) => state.setZoom);
  const setFitMode = useReaderStore((state) => state.setFitMode);
  const zoomLevel = useReaderStore((state) => state.zoom);
  const fitMode = useReaderStore((state) => state.fitMode);
  const [viewerReady, setViewerReady] = useState(false);
  const [viewerInitialPage, setViewerInitialPage] = useState(0);
  const [promptOpen, setPromptOpen] = useState(Boolean(readingPosition && readingPosition.last_page > 1));
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const viewerRef = useRef<HTMLDivElement | null>(null);

  const signedUrlQuery = useSignedPdfUrl(pdf.file_url);
  const pageNavigation = pageNavigationPlugin({ enableShortcuts: true });
  const zoom = zoomPlugin({ enableShortcuts: true });
  const search = searchPlugin({ enableShortcuts: true });
  const thumbnails = thumbnailPlugin({ thumbnailWidth: 120 });

  const completion = chapterCompletion(chapters, progress);

  useEffect(() => {
    if (!viewerRef.current) return;
    const element = viewerRef.current;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!viewerReady || !pdf.id) return;
    const supabase = createSupabaseBrowserClient();
    const interval = window.setInterval(async () => {
      const { error } = await supabase.from("reading_position").upsert({
        pdf_id: pdf.id,
        last_page: currentPage,
        updated_at: new Date().toISOString(),
      });
      if (error) toast.error("Could not save reading position");
    }, READER_SAVE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [currentPage, pdf.id, viewerReady]);

  const bookmarkHere = useMutation<void, Error, void>({
    mutationFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const existing = bookmarks.find((item) => item.page_number === currentPage);
      if (existing) {
        const { error } = await supabase.from("bookmarks").delete().eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("bookmarks").insert({ pdf_id: pdf.id, page_number: currentPage });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bookmarks", pdf.id] }),
  });

  const currentAnnotationPage = annotations.filter((item) => item.page_number === currentPage);

  const toolbar = (
    <div className="sticky top-16 z-20 mb-4 rounded-2xl border border-border bg-card/90 p-3 shadow-soft backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="rounded-xl">
          <a href="/dashboard">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Library
          </a>
        </Button>
        <div className="h-6 w-px bg-border" />
        <Button variant="outline" size="sm" className="rounded-xl" onClick={() => pageNavigation.jumpToPreviousPage()}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Prev
        </Button>
        <Button variant="outline" size="sm" className="rounded-xl" onClick={() => pageNavigation.jumpToNextPage()}>
          Next
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
        <div className="rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground">
          Page {currentPage} of {pdf.total_pages}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { const next = Math.max(0.5, zoomLevel - 0.1); setZoom(next); zoom.zoomTo(next); }}>
            -
          </Button>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { const next = Math.min(2.5, zoomLevel + 0.1); setZoom(next); zoom.zoomTo(next); }}>
            +
          </Button>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { setFitMode("width"); zoom.zoomTo(SpecialZoomLevel.PageWidth); }}>
            Fit width
          </Button>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { setFitMode("page"); zoom.zoomTo(SpecialZoomLevel.PageFit); }}>
            Fit page
          </Button>
          <div className="rounded-xl border border-border bg-background px-3 py-2 text-sm">
            <search.Search>
              {(props) => (
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    value={props.keyword}
                    onChange={(event) => {
                      props.setKeyword(event.target.value);
                      void props.search();
                    }}
                    placeholder="Search text"
                    className="h-8 w-56 rounded-lg border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                  />
                  {props.numberOfMatches ? <Badge variant="secondary">{props.currentMatch + 1}/{props.numberOfMatches}</Badge> : null}
                </div>
              )}
            </search.Search>
          </div>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => bookmarkHere.mutate()}>
            <BookMarked className="mr-2 h-4 w-4" />
            Bookmark
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <AppShell>
      <div className="space-y-4">
        {toolbar}
        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
          <Card className="order-2 overflow-hidden xl:order-1">
            <CardHeader className="pb-3">
              <CardTitle className="font-heading">{pdf.title}</CardTitle>
              <CardDescription>{formatPercent(completion)} complete · {chapters.length} chapters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs defaultValue="chapters">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="chapters">Chapters</TabsTrigger>
                  <TabsTrigger value="thumbs">Pages</TabsTrigger>
                </TabsList>
                <TabsContent value="chapters" className="space-y-4">
                  <ChapterSidebar
                    chapters={chapters}
                    progress={progress}
                    pdfId={pdf.id}
                    userId={userId}
                    onJump={(page) => {
                      pageNavigation.jumpToPage(page - 1);
                      setCurrentPage(page);
                    }}
                  />
                </TabsContent>
                <TabsContent value="thumbs">
                  <ScrollArea className="h-[560px] rounded-2xl border border-border p-3">
                    <thumbnails.Thumbnails thumbnailDirection={ThumbnailDirection.Vertical} />
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card className="order-1 overflow-hidden xl:order-2">
            <CardContent className="space-y-4 p-4">
              <div ref={viewerRef} className="relative min-h-[70vh] rounded-2xl border border-border bg-background">
                {signedUrlQuery.isLoading ? (
                  <div className="grid min-h-[70vh] place-items-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : signedUrlQuery.data ? (
                  <Worker workerUrl={`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`}>
                    <Viewer
                      key={viewerInitialPage}
                      fileUrl={signedUrlQuery.data}
                      initialPage={viewerInitialPage}
                      defaultScale={fitMode === "page" ? SpecialZoomLevel.PageFit : SpecialZoomLevel.PageWidth}
                      plugins={[pageNavigation, search, thumbnails, zoom]}
                      renderLoader={(percentages) => (
                        <div className="grid min-h-[70vh] place-items-center">
                          <div className="space-y-3 text-center">
                            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                            <div className="text-sm text-muted-foreground">Loading PDF {Math.round(percentages)}%</div>
                          </div>
                        </div>
                      )}
                      onPageChange={(event: PageChangeEvent) => {
                        setCurrentPage(event.currentPage + 1);
                      }}
                      onDocumentLoad={() => setViewerReady(true)}
                    />
                  </Worker>
                ) : (
                  <div className="grid min-h-[70vh] place-items-center text-sm text-muted-foreground">Unable to open PDF.</div>
                )}
                {viewerReady ? (
                  <AnnotationCanvas
                    currentPage={currentPage}
                    width={containerSize.width}
                    height={containerSize.height}
                    initialAnnotations={currentAnnotationPage}
                    pdfId={pdf.id}
                  />
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="order-3 overflow-hidden">
            <CardContent className="space-y-4 p-4">
              <Tabs defaultValue="notes" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="notes">Notes</TabsTrigger>
                  <TabsTrigger value="bookmarks">Bookmarks</TabsTrigger>
                </TabsList>
                <TabsContent value="notes">
                  <NotesEditor currentPage={currentPage} pdfId={pdf.id} initialNotes={notes} />
                </TabsContent>
                <TabsContent value="bookmarks">
                  <BookmarkPanel
                    pdfId={pdf.id}
                    currentPage={currentPage}
                    initialBookmarks={bookmarks}
                    onJump={(page) => {
                      pageNavigation.jumpToPage(page - 1);
                      setCurrentPage(page);
                    }}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={promptOpen} onOpenChange={setPromptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resume reading</DialogTitle>
            <DialogDescription>
              Continue from page {readingPosition?.last_page ?? 1} or start from the beginning.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setViewerInitialPage(0);
                setPromptOpen(false);
                setViewerReady(true);
              }}
            >
              Start from beginning
            </Button>
            <Button
              onClick={() => {
                setViewerInitialPage(Math.max(0, (readingPosition?.last_page ?? 1) - 1));
                setPromptOpen(false);
                setViewerReady(true);
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
