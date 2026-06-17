export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      pdfs: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          file_url: string;
          total_pages: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          file_url: string;
          total_pages?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          file_url?: string;
          total_pages?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      chapters: {
        Row: {
          id: string;
          pdf_id: string;
          title: string;
          start_page: number;
          end_page: number;
        };
        Insert: {
          id?: string;
          pdf_id: string;
          title: string;
          start_page: number;
          end_page: number;
        };
        Update: {
          id?: string;
          pdf_id?: string;
          title?: string;
          start_page?: number;
          end_page?: number;
        };
        Relationships: [
          {
            foreignKeyName: "chapters_pdf_id_fkey";
            columns: ["pdf_id"];
            referencedRelation: "pdfs";
            referencedColumns: ["id"];
          },
        ];
      };
      progress: {
        Row: {
          id: string;
          user_id: string;
          chapter_id: string;
          completed: boolean;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          chapter_id: string;
          completed?: boolean;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          chapter_id?: string;
          completed?: boolean;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "progress_chapter_id_fkey";
            columns: ["chapter_id"];
            referencedRelation: "chapters";
            referencedColumns: ["id"];
          },
        ];
      };
      bookmarks: {
        Row: {
          id: string;
          user_id: string;
          pdf_id: string;
          page_number: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          pdf_id: string;
          page_number: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          pdf_id?: string;
          page_number?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      notes: {
        Row: {
          id: string;
          user_id: string;
          pdf_id: string;
          page_number: number;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          pdf_id: string;
          page_number: number;
          content: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          pdf_id?: string;
          page_number?: number;
          content?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reading_position: {
        Row: {
          id: string;
          user_id: string;
          pdf_id: string;
          last_page: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          pdf_id: string;
          last_page: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          pdf_id?: string;
          last_page?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      annotations: {
        Row: {
          id: string;
          user_id: string;
          pdf_id: string;
          page_number: number;
          data: Json;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          pdf_id: string;
          page_number: number;
          data?: Json;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          pdf_id?: string;
          page_number?: number;
          data?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
