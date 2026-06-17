"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { Loader2, UploadCloud, FileWarning, WandSparkles } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/supabase/auth";
import { buildStoragePath, isPdfFile, getPdfPageCount } from "@/lib/pdf";
import { STORAGE_BUCKET } from "@/lib/constants";

export function UploadClient({ userId }: { userId: string | null }) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;
      if (!userId) {
        toast.error("Session expired. Please login again.");
        router.push("/login");
        return;
      }
      if (!isPdfFile(file)) {
        toast.error("Only PDF files are allowed.");
        return;
      }

      setUploading(true);
      setProgress(5);
      setFileName(file.name);
      const supabase = createSupabaseBrowserClient();

      try {
        const currentUserId = userId ?? (await getCurrentUserId());
        const storagePath = buildStoragePath(currentUserId, file.name);
        const totalPagesPromise = getPdfPageCount(file);

        const fakeProgress = window.setInterval(() => {
          setProgress((current) => Math.min(92, current + 6));
        }, 180);

        const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: "application/pdf",
        });
        window.clearInterval(fakeProgress);

        if (uploadError) {
          throw uploadError;
        }

        setProgress(95);
        const totalPages = await totalPagesPromise;

        const { error: insertError } = await supabase.from("pdfs").insert({
          user_id: currentUserId,
          title: file.name.replace(/\.pdf$/i, ""),
          file_url: storagePath,
          total_pages: totalPages,
        });

        if (insertError) {
          throw insertError;
        }

        setProgress(100);
        toast.success("PDF uploaded");
        router.push("/dashboard");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed");
        setProgress(0);
      } finally {
        setUploading(false);
      }
    },
    [router, userId],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
    noClick: true,
    disabled: uploading,
  });

  const helper = useMemo(() => {
    if (uploading) return "Uploading and extracting page count...";
    return "Drop a PDF here or pick one from your device.";
  }, [uploading]);

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.15),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.12),transparent_26%)]" />
          <CardHeader className="relative">
            <Badge className="w-fit">Upload</Badge>
            <CardTitle className="font-heading text-3xl">Add a new PDF to your workspace</CardTitle>
            <CardDescription className="max-w-2xl">
              PDFs are stored in Supabase Storage, indexed in PostgreSQL, and ready for notes, progress, bookmarks, and drawing.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardContent className="space-y-5 p-6">
            <div
              {...getRootProps()}
              className={`grid min-h-[280px] cursor-pointer place-items-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
                isDragActive ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/60 hover:bg-accent/40"
              }`}
            >
              <input {...getInputProps()} />
              <div className="max-w-md space-y-3">
                {uploading ? <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" /> : <UploadCloud className="mx-auto h-12 w-12 text-primary" />}
                <div className="font-heading text-2xl">{isDragActive ? "Drop the PDF" : "Drag and drop your PDF"}</div>
                <div className="text-sm text-muted-foreground">{helper}</div>
                {fileName ? <div className="text-xs text-muted-foreground">{fileName}</div> : null}
              </div>
            </div>

            {uploading ? (
              <div className="space-y-2">
                <Progress value={progress} />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Uploading</span>
                  <span>{progress}%</span>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={open} disabled={uploading}>
                <WandSparkles className="mr-2 h-4 w-4" />
                Choose PDF
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard">Back to library</Link>
              </Button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileWarning className="h-4 w-4" />
                Invalid files are rejected before upload.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
