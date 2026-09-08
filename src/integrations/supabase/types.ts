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
      campaign_teams: {
        Row: {
          assigned_by: string | null
          campaign_id: string
          created_at: string
          id: string
          joined_at: string | null
          target: number
          team_id: string
        }
        Insert: {
          assigned_by?: string | null
          campaign_id: string
          created_at?: string
          id?: string
          joined_at?: string | null
          target?: number
          team_id: string
        }
        Update: {
          assigned_by?: string | null
          campaign_id?: string
          created_at?: string
          id?: string
          joined_at?: string | null
          target?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_teams_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          ends_on: string | null
          id: string
          is_active: boolean
          name: string
          starts_on: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_on?: string | null
          id?: string
          is_active?: boolean
          name: string
          starts_on?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_on?: string | null
          id?: string
          is_active?: boolean
          name?: string
          starts_on?: string
        }
        Relationships: []
      }
      outreach_links: {
        Row: {
          channel: Database["public"]["Enums"]["outreach_channel"]
          clicked_at: string | null
          contact_handle: string
          contact_name: string | null
          created_at: string
          id: string
          raw_row: Json | null
          source_file: string | null
          team_id: string | null
          upload_id: string | null
          url: string
          user_id: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["outreach_channel"]
          clicked_at?: string | null
          contact_handle: string
          contact_name?: string | null
          created_at?: string
          id?: string
          raw_row?: Json | null
          source_file?: string | null
          team_id?: string | null
          upload_id?: string | null
          url: string
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["outreach_channel"]
          clicked_at?: string | null
          contact_handle?: string
          contact_name?: string | null
          created_at?: string
          id?: string
          raw_row?: Json | null
          source_file?: string | null
          team_id?: string | null
          upload_id?: string | null
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_links_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_links_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          is_active: boolean
          team_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email: string
          id: string
          is_active?: boolean
          team_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          is_active?: boolean
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          leader_email: string | null
          leader_id: string | null
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          leader_email?: string | null
          leader_id?: string | null
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          leader_email?: string | null
          leader_id?: string | null
          name?: string
        }
        Relationships: []
      }
      uploads: {
        Row: {
          created_at: string
          file_name: string
          id: string
          total_rows: number
          user_id: string
          valid_rows: number
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          total_rows?: number
          user_id: string
          valid_rows?: number
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          total_rows?: number
          user_id?: string
          valid_rows?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      campaign_progress: {
        Args: { _campaign_id: string }
        Returns: {
          clicked: number
          generated: number
          joined_at: string
          target: number
          team_id: string
          team_name: string
        }[]
      }
      can_view_user: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      leads_team: { Args: { _team_id: string }; Returns: boolean }
      my_team_id: { Args: never; Returns: string }
      outreach_daily: {
        Args: { _days: number; _team_id?: string; _user_id?: string }
        Returns: {
          day: string
          email_click: number
          email_gen: number
          social_click: number
          social_gen: number
          total_click: number
          total_gen: number
          whatsapp_click: number
          whatsapp_gen: number
        }[]
      }
      outreach_leaderboard: {
        Args: { _days?: number; _team_id?: string }
        Returns: {
          avatar_url: string
          clicked: number
          display_name: string
          email: string
          generated: number
          team_id: string
          team_name: string
          user_id: string
        }[]
      }
      outreach_totals: {
        Args: { _since?: string; _team_id?: string; _user_id?: string }
        Returns: {
          clicked: number
          generated: number
        }[]
      }
    }
    Enums: {
      app_role: "member" | "team_leader" | "super_admin"
      outreach_channel:
        | "email"
        | "whatsapp"
        | "facebook"
        | "instagram"
        | "tiktok"
        | "linkedin"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["member", "team_leader", "super_admin"],
      outreach_channel: [
        "email",
        "whatsapp",
        "facebook",
        "instagram",
        "tiktok",
        "linkedin",
      ],
    },
  },
} as const
