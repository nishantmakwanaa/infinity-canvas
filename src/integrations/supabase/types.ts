export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      canvases: {
        Row: {
          blocks: Json
          created_at: string
          drawings: Json
          id: string
          name: string
          pan_x: number
          pan_y: number
          updated_at: string
          user_id: string
          zoom: number
        }
        Insert: {
          blocks?: Json
          created_at?: string
          drawings?: Json
          id?: string
          name?: string
          pan_x?: number
          pan_y?: number
          updated_at?: string
          user_id: string
          zoom?: number
        }
        Update: {
          blocks?: Json
          created_at?: string
          drawings?: Json
          id?: string
          name?: string
          pan_x?: number
          pan_y?: number
          updated_at?: string
          user_id?: string
          zoom?: number
        }
        Relationships: []
      }
      canvas_editor_sessions: {
        Row: {
          id: string
          canvas_id: string
          user_id: string
          client_id: string
          created_at: string
          last_seen_at: string
          expires_at: string
        }
        Insert: {
          id?: string
          canvas_id: string
          user_id: string
          client_id?: string
          created_at?: string
          last_seen_at?: string
          expires_at?: string
        }
        Update: {
          id?: string
          canvas_id?: string
          user_id?: string
          client_id?: string
          created_at?: string
          last_seen_at?: string
          expires_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvas_editor_sessions_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_permissions: {
        Row: {
          id: string
          canvas_id: string
          user_id: string
          role: string
          granted_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          canvas_id: string
          user_id: string
          role?: string
          granted_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          canvas_id?: string
          user_id?: string
          role?: string
          granted_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvas_permissions_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_canvases: {
        Row: {
          access_level: string
          canvas_name: string
          canvas_id: string
          created_at: string
          id: string
          owner_username: string
          page_name: string
          share_token: string
        }
        Insert: {
          access_level?: string
          canvas_name?: string
          canvas_id: string
          created_at?: string
          id?: string
          owner_username?: string
          page_name?: string
          share_token?: string
        }
        Update: {
          access_level?: string
          canvas_name?: string
          canvas_id?: string
          created_at?: string
          id?: string
          owner_username?: string
          page_name?: string
          share_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_canvases_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
        ]
      }
      user_canvas_state: {
        Row: {
          user_id: string
          last_opened_canvas_id: string | null
          updated_at: string
        }
        Insert: {
          user_id: string
          last_opened_canvas_id?: string | null
          updated_at?: string
        }
        Update: {
          user_id?: string
          last_opened_canvas_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_canvas_state_last_opened_canvas_id_fkey"
            columns: ["last_opened_canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_editor_slot: {
        Args: {
          p_canvas_id: string
          p_client_id?: string | null
          p_ttl_seconds?: number | null
        }
        Returns: {
          granted: boolean
          active_count: number
          limit_count: number
        }[]
      }
      create_canvas_with_unique_name: {
        Args: {
          p_name: string
          p_blocks?: Json
          p_drawings?: Json
          p_pan_x?: number
          p_pan_y?: number
          p_zoom?: number
        }
        Returns: {
          id: string
          name: string
          updated_at: string
        }[]
      }
      get_canvas_for_user: {
        Args: { p_canvas_id: string }
        Returns: {
          id: string
          user_id: string
          name: string
          blocks: Json
          drawings: Json
          pan_x: number
          pan_y: number
          zoom: number
          updated_at: string
        }[]
      }
      get_last_opened_canvas_id: {
        Args: Record<PropertyKey, never>
        Returns: { canvas_id: string | null }[]
      }
      list_joined_canvases: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          name: string
          updated_at: string
          role: string
        }[]
      }
      list_owned_canvases: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          name: string
          updated_at: string
        }[]
      }
      open_page_api_link: {
        Args: {
          p_user_token: string
          p_canvas_token: string
          p_page_token: string
        }
        Returns: {
          blocks: Json
          canvas_id: string
          canvas_name: string
          can_edit: boolean
          drawings: Json
          is_share: boolean
          owner_user_id: string
          owner_username: string
          page_name: string
          pan_x: number
          pan_y: number
          share_access: string | null
          zoom: number
        }[]
      }
      release_editor_slot: {
        Args: { p_canvas_id: string }
        Returns: boolean
      }
      resolve_user_canvas: {
        Args: {
          p_owner_username: string
          p_canvas_name: string
          p_page_name?: string | null
        }
        Returns: string
      }
      set_last_opened_canvas_id: {
        Args: { p_canvas_id: string | null }
        Returns: { canvas_id: string | null }[]
      }
      sync_canvas_permission_from_share: {
        Args: {
          p_canvas_id: string
          p_access_level?: string | null
        }
        Returns: {
          canvas_id: string
          user_id: string
          role: string
        }[]
      }
      upsert_canvas_share: {
        Args: {
          p_canvas_id: string
          p_access_level?: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
