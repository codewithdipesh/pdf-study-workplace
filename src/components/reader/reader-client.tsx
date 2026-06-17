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
import {
  ArrowLeft,
  BookMarked,
  BookmarkPlus,
  Eraser,
  Highlighter,
  Loader2,
  Pencil,
  Search,
  Trash2,
  Undo2,
  Redo2,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Menu,
  Sparkles,
  X,
  ChevronDown,
} from "lucide-react";
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
import { getCurrentUserId } from "@/lib/supabase/auth";
import { ANNOTATION_DEBOUNCE_MS, READER_SAVE_INTERVAL_MS, STORAGE_BUCKET } from "@/lib/constants";
import { cn, formatDate, formatPercent, safeJsonParse } from "@/lib/utils";
import { useReaderTool, useSetReaderTool, type ReaderTool } from "@/store/use-reader-store";

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
  const completed = chapters.filter((chapter) =>
    progress.some((item) => item.chapter_id === chapter.id && item.completed),
  ).length;
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
      const currentUserId = userId || (await getCurrentUserId());
      const current = progressRows.find((item) => item.chapter_id === chapterId);
      if (current) {
        const { error } = await supabase.from("progress").update({
          completed: !current.completed,
          completed_at: !current.completed ? new Date().toISOString() : null,
        }).eq("id", current.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("progress").insert({
          user_id: currentUserId,
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
    <div className="space-y-3">
      <Input
        placeholder="Filter chapters..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="rounded-lg"
      />
      <ScrollArea className="h-[calc(100vh-300px)]">
        <div className="space-y-2 pr-4">
          {filtered.map((chapter) => {
            const isCompleted = progressRows.some(
              (p) => p.chapter_id === chapter.id && p.completed,
            );
            return (
              <button
                key={chapter.id}
                onClick={() => onJump(chapter.start_page)}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left text-sm transition-all",
                  isCompleted
                    ? "border-green-200 bg-green-50"
                    : "border-border hover:bg-accent",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium line-clamp-2">{chapter.title}</div>
                    <div className="text-xs text-muted-foreground">
                      Pages {chapter.start_page}–{chapter.end_page}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={isCompleted ? "default" : "outline"}
                    className="h-6 w-6 p-0 flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMutation.mutate(chapter.id);
                    }}
                  >
                    {isCompleted ? "✓" : ""}
                  </Button>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function BookmarkSidebar({
  pdfId,
  userId,
  currentPage,
  onJump,
}: {
  pdfId: string;
  userId: string;
  currentPage: number;
  onJump: (page: number) => void;
}) {
  const queryClient = useQueryClient();
  const bookmarksQuery = useQuery({
    queryKey: ["bookmarks", pdfId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("bookmarks")
        .select("id,page_number,created_at")
        .eq("user_id", userId)
        .eq("pdf_id", pdfId)
        .order("page_number", { ascending: true });
      if (error) throw error;
      return data as BookmarkRow[];
    },
  });

  const toggleMutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const existing = bookmarksQuery.data?.find((item) => item.page_number === currentPage);
      if (existing) {
        const { error } = await supabase.from("bookmarks").delete().eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("bookmarks").insert({
          user_id: userId,
          pdf_id: pdfId,
          page_number: currentPage,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bookmarks", pdfId] }),
  });

  return (
    <div className="space-y-3">
      <Button
        variant={bookmarksQuery.data?.some((b) => b.page_number === currentPage) ? "default" : "outline"}
        className="w-full rounded-lg"
        onClick={() => toggleMutation.mutate()}
      >
        <BookmarkPlus className="mr-2 h-4 w-4" />
        {bookmarksQuery.data?.some((b) => b.page_number === currentPage) ? "Remove Bookmark" : "Bookmark This Page"}
      </Button>
      <ScrollArea className="h-[calc(100vh-350px)]">
        <div className="space-y-2 pr-4">
          {bookmarksQuery.data?.map((bookmark) => (
            <button
              key={bookmark.id}
              onClick={() => onJump(bookmark.page_number)}
              className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
            >
              <div className="font-medium">Page {bookmark.page_number}</div>
              <div className="text-xs text-muted-foreground">{formatDate(bookmark.created_at)}</div>
            </button>
          ))}
          {!bookmarksQuery.data?.length && (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              No bookmarks yet
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function NotesPanel({
  pdfId,
  userId,
  currentPage,
}: {
  pdfId: string;
  userId: string;
  currentPage: number;
}) {
  const [content, setContent] = useState("");
  const queryClient = useQueryClient();

  const notesQuery = useQuery({
    queryKey: ["notes", pdfId, currentPage],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("notes")
        .select("id,content,created_at,updated_at")
        .eq("user_id", userId)
        .eq("pdf_id", pdfId)
        .eq("page_number", currentPage)
        .maybeSingle();
      if (error) throw error;
      return data as NoteRow | null;
    },
  });

  useEffect(() => {
    setContent(notesQuery.data?.content ?? "");
  }, [notesQuery.data]);

  const saveMutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      const supabase = createSupabaseBrowserClient();
      if (!notesQuery.data) {
        const { error } = await supabase.from("notes").insert({
          user_id: userId,
          pdf_id: pdfId,
          page_number: currentPage,
          content,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("notes").update({ content }).eq("id", notesQuery.data.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes", pdfId, currentPage] });
      toast.success("Note saved");
    },
  });

  return (
    <div className="space-y-3">
      <div>
        <div className="font-medium mb-2">Page {currentPage}</div>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add your notes here..."
          className="min-h-[120px] rounded-lg resize-none"
        />
      </div>
      <Button
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        className="w-full rounded-lg"
      >
        {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Save Note
      </Button>
      {notesQuery.data?.updated_at && (
        <div className="text-xs text-muted-foreground">
          Last updated {formatDate(notesQuery.data.updated_at)}
        </div>
      )}
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
  const viewerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<any>(null);
  const [currentPage, setCurrentPage] = useState(readingPosition?.last_page ?? 1);
  const [viewerReady, setViewerReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"chapters" | "bookmarks">("chapters");
  const [notesOpen, setNotesOpen] = useState(false);
  const [fitMode, setFitMode] = useState<"page" | "width">("width");
  const [drawingMode, setDrawingMode] = useState(false);
  const tool = useReaderTool();
  const setTool = useSetReaderTool();
  const [lines, setLines] = useState<any[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const history = useRef<any[]>([]);
  const queryClient = useQueryClient();

  const search = searchPlugin();
  const pageNavigation = pageNavigationPlugin();
  const thumbnails = thumbnailPlugin();
  const zoom = zoomPlugin();
  const plugins = [search, pageNavigation, thumbnails, zoom];

  const signedUrlQuery = useSignedPdfUrl(pdf.file_url);
  const completion = chapterCompletion(chapters, progress);

  // Load annotations for current page
  useEffect(() => {
    const pageAnnotations = annotations.find((a) => a.page_number === currentPage);
    if (pageAnnotations?.data) {
      const data = safeJsonParse<AnnotationData>(pageAnnotations.data, { strokes: [] });
      setLines(data.strokes);
    } else {
      setLines([]);
    }
  }, [currentPage, annotations]);

  // Save reading position
  useEffect(() => {
    const interval = window.setInterval(async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const currentUserId = userId || (await getCurrentUserId());
        const { error } = await supabase.from("reading_position").upsert({
          user_id: currentUserId,
          pdf_id: pdf.id,
          last_page: currentPage,
        });
        if (error) throw error;
      } catch {
        // Silently fail
      }
    }, READER_SAVE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [currentPage, pdf.id, viewerReady, userId]);

  // Save annotations
  useEffect(() => {
    if (!drawingMode || !lines.length) return;

    const timeoutId = setTimeout(async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const currentUserId = userId || (await getCurrentUserId());
        const existing = annotations.find((a) => a.page_number === currentPage);

        const data: AnnotationData = { strokes: lines };

        if (existing) {
          const { error } = await supabase
            .from("annotations")
            .update({ data })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("annotations").insert({
            user_id: currentUserId,
            pdf_id: pdf.id,
            page_number: currentPage,
            data,
          });
          if (error) throw error;
        }
        queryClient.invalidateQueries({ queryKey: ["annotations", pdf.id] });
      } catch (error) {
        console.error("Failed to save annotations", error);
      }
    }, ANNOTATION_DEBOUNCE_MS);

    return () => clearTimeout(timeoutId);
  }, [lines, drawingMode, currentPage, pdf.id, userId, annotations, queryClient]);

  const handleMouseDown = (e: any) => {
    if (!drawingMode) return;
    e.evt?.preventDefault();
    e.evt?.stopPropagation();
    setIsDrawing(true);
    const pos = e.target.getStage().getPointerPosition();
    history.current.push(lines);
    setLines([
      ...lines,
      {
        points: [pos.x, pos.y],
        color: tool === "highlighter" ? "rgba(255,255,0,0.3)" : tool === "eraser" ? "#ffffff" : "#000000",
        width: tool === "eraser" ? 20 : tool === "highlighter" ? 15 : 3,
        opacity: 1,
        mode: tool,
      },
    ]);
  };

  const handleMouseMove = (e: any) => {
    if (!drawingMode || !isDrawing || !lines.length) return;
    e.evt?.preventDefault();
    e.evt?.stopPropagation();
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    const lastLine = lines[lines.length - 1];
    if (!lastLine) return;

    const newLines = lines.slice(0, -1).concat({
      ...lastLine,
      points: lastLine.points.concat([point.x, point.y]),
    });
    setLines(newLines);
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  const undo = () => {
    if (history.current.length === 0) return;
    const prevLines = history.current.pop();
    setLines(prevLines);
  };

  const redo = () => {
    // Implement if needed
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't prevent default for all keys, only the ones we handle
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      if (isInput) return; // Don't intercept keyboard in inputs

      if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        setFitMode("width");
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        setFitMode("page");
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        if (zoom?.ZoomIn) {
          (zoom.ZoomIn as any)();
        }
      } else if (e.key === "-") {
        e.preventDefault();
        if (zoom?.ZoomOut) {
          (zoom.ZoomOut as any)();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoom]);

  return (
    <div className="h-screen w-full bg-background flex flex-col">
      {/* Top Toolbar */}
      <div className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between h-14 px-4 gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-lg">
              <a href="/dashboard">
                <ArrowLeft className="h-5 w-5" />
              </a>
            </Button>
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{pdf.title}</div>
              <div className="text-xs text-muted-foreground">
                Page {currentPage} of {pdf.total_pages}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-xs">
            <Button variant="ghost" size="icon" className="rounded-lg h-9 w-9" onClick={() => (zoom.ZoomOut as any)()}>
              <span className="text-xs font-medium">−</span>
            </Button>
            <Button variant="ghost" size="icon" className="rounded-lg h-9 w-9" onClick={() => (zoom.ZoomIn as any)()}>
              <span className="text-xs font-medium">+</span>
            </Button>
            <Button variant="ghost" size="icon" className="rounded-lg h-9 w-9" onClick={() => setFitMode("width")}>
              <span className="text-xs font-medium">W</span>
            </Button>
            <Button variant="ghost" size="icon" className="rounded-lg h-9 w-9" onClick={() => setFitMode("page")}>
              <span className="text-xs font-medium">P</span>
            </Button>
            <div className="hidden sm:block flex-1 px-2">
              <search.Search>
                {(props) => (
                  <div className="flex items-center gap-1 bg-secondary rounded-lg px-2 py-1">
                    <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <input
                      value={props.keyword}
                      onChange={(e) => {
                        props.setKeyword(e.target.value);
                        void props.search();
                      }}
                      placeholder="Find..."
                      className="h-7 w-full bg-transparent text-sm outline-none"
                    />
                  </div>
                )}
              </search.Search>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-lg">
              {formatPercent(completion)} complete
            </Badge>
            <Button
              variant={drawingMode ? "default" : "outline"}
              size="icon"
              className="rounded-lg h-9 w-9"
              onClick={() => setDrawingMode(!drawingMode)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant={notesOpen ? "default" : "outline"}
              size="icon"
              className="rounded-lg h-9 w-9"
              onClick={() => setNotesOpen(!notesOpen)}
            >
              <Sparkles className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="rounded-lg h-9 w-9"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden gap-4 p-4">
        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-72 border border-border rounded-xl bg-card p-4 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">{sidebarTab === "chapters" ? "Chapters" : "Bookmarks"}</h2>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSidebarOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Tabs value={sidebarTab} onValueChange={(v) => setSidebarTab(v as "chapters" | "bookmarks")}>
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="chapters">Chapters</TabsTrigger>
                <TabsTrigger value="bookmarks">Bookmarks</TabsTrigger>
              </TabsList>
              <TabsContent value="chapters" className="flex-1 overflow-hidden">
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
              <TabsContent value="bookmarks" className="flex-1 overflow-hidden">
                <BookmarkSidebar
                  pdfId={pdf.id}
                  userId={userId}
                  currentPage={currentPage}
                  onJump={(page) => {
                    pageNavigation.jumpToPage(page - 1);
                    setCurrentPage(page);
                  }}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* PDF Viewer - Main Focus */}
        <div className={cn("flex-1 border border-border rounded-xl overflow-hidden bg-card flex flex-col relative", drawingMode && "select-none")}>
          {/* Drawing Toolbar - Top Liquid Glass */}
          {drawingMode && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-black/70 backdrop-blur-lg border border-white/30 rounded-full px-3 py-2 shadow-2xl">
              <Button
                size="sm"
                variant={tool === "pen" ? "default" : "ghost"}
                className="h-7 w-7 p-0 rounded-full text-white hover:bg-white/20"
                onClick={() => setTool("pen")}
                title="Pen"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant={tool === "highlighter" ? "default" : "ghost"}
                className="h-7 w-7 p-0 rounded-full text-white hover:bg-white/20"
                onClick={() => setTool("highlighter")}
                title="Highlighter"
              >
                <Highlighter className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant={tool === "eraser" ? "default" : "ghost"}
                className="h-7 w-7 p-0 rounded-full text-white hover:bg-white/20"
                onClick={() => setTool("eraser")}
                title="Eraser"
              >
                <Eraser className="h-3.5 w-3.5" />
              </Button>
              <div className="w-px h-4 bg-white/20" />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 rounded-full text-white hover:bg-white/20"
                onClick={undo}
                title="Undo"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 rounded-full text-white hover:bg-white/20"
                onClick={() => setLines([])}
                title="Clear"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {signedUrlQuery.isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                <div className="text-sm text-muted-foreground">Loading PDF...</div>
              </div>
            </div>
          ) : signedUrlQuery.data ? (
            <Worker workerUrl="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js">
              <div ref={viewerRef} className={cn("flex-1 overflow-auto relative", drawingMode && "select-none")}>
                <Viewer
                  fileUrl={signedUrlQuery.data}
                  initialPage={currentPage - 1}
                  defaultScale={fitMode === "page" ? SpecialZoomLevel.PageFit : SpecialZoomLevel.PageWidth}
                  plugins={plugins}
                  onPageChange={(event: PageChangeEvent) => {
                    setCurrentPage(event.currentPage + 1);
                  }}
                  onDocumentLoad={() => setViewerReady(true)}
                />

                {/* Drawing Canvas Overlay - On Top */}
                {drawingMode && (
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      zIndex: 50,
                      pointerEvents: isDrawing ? "auto" : "none",
                      userSelect: "none",
                      WebkitUserSelect: "none",
                    }}
                  >
                    <Stage
                      ref={stageRef}
                      width={viewerRef.current?.offsetWidth || 800}
                      height={viewerRef.current?.offsetHeight || 600}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                      listening={true}
                      style={{
                        cursor: isDrawing ? "crosshair" : "default",
                      }}
                    >
                      <Layer>
                        {lines.map((line, i) => (
                          <Line
                            key={i}
                            points={line.points}
                            stroke={line.color}
                            strokeWidth={line.width}
                            tension={0.5}
                            lineCap="round"
                            lineJoin="round"
                            opacity={line.opacity}
                            globalCompositeOperation={line.mode === "eraser" ? "destination-out" : "source-over"}
                          />
                        ))}
                      </Layer>
                    </Stage>
                  </div>
                )}
              </div>
            </Worker>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-sm text-muted-foreground">Could not load PDF</div>
            </div>
          )}
        </div>

        {/* Notes Panel - Right Overlay */}
        {notesOpen && (
          <div className="w-80 border border-border rounded-xl bg-card p-4 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Notes</h2>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setNotesOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <NotesPanel pdfId={pdf.id} userId={userId} currentPage={currentPage} />
          </div>
        )}
      </div>
    </div>
  );
}
