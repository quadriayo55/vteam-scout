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
      bulk_send_recipients: {
        Row: {
          bounced_at: string | null
          brand: string | null
          claimed_at: string | null
          click_count: number
          complained_at: string | null
          contact_name: string | null
          created_at: string
          delivered_at: string | null
          domain: string | null
          email: string
          error: string | null
          first_click_at: string | null
          first_open_at: string | null
          id: string
          last_click_at: string | null
          last_open_at: string | null
          open_count: number
          provider_id: string | null
          replied_at: string | null
          row_data: Json
          send_id: string
          sent_at: string | null
          status: string
          user_id: string
          variant: number
        }
        Insert: {
          bounced_at?: string | null
          brand?: string | null
          claimed_at?: string | null
          click_count?: number
          complained_at?: string | null
          contact_name?: string | null
          created_at?: string
          delivered_at?: string | null
          domain?: string | null
          email: string
          error?: string | null
          first_click_at?: string | null
          first_open_at?: string | null
          id?: string
          last_click_at?: string | null
          last_open_at?: string | null
          open_count?: number
          provider_id?: string | null
          replied_at?: string | null
          row_data?: Json
          send_id: string
          sent_at?: string | null
          status?: string
          user_id: string
          variant?: number
        }
        Update: {
          bounced_at?: string | null
          brand?: string | null
          claimed_at?: string | null
          click_count?: number
          complained_at?: string | null
          contact_name?: string | null
          created_at?: string
          delivered_at?: string | null
          domain?: string | null
          email?: string
          error?: string | null
          first_click_at?: string | null
          first_open_at?: string | null
          id?: string
          last_click_at?: string | null
          last_open_at?: string | null
          open_count?: number
          provider_id?: string | null
          replied_at?: string | null
          row_data?: Json
          send_id?: string
          sent_at?: string | null
          status?: string
          user_id?: string
          variant?: number
        }
        Relationships: [
          {
            foreignKeyName: "bulk_send_recipients_send_id_fkey"
            columns: ["send_id"]
            isOneToOne: false
            referencedRelation: "bulk_sends"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_sends: {
        Row: {
          batch_size: number
          body: string
          created_at: string
          daily_cap: number
          failed: number
          from_email: string
          from_name: string
          gap_seconds: number
          id: string
          locked_until: string | null
          merge_keys: Json
          name: string
          reply_to: string | null
          rotation: string
          rotation_size: number
          sent: number
          source_files: Json
          status: string
          subject: string
          team_id: string | null
          total: number
          updated_at: string
          user_id: string
          variants: Json
        }
        Insert: {
          batch_size?: number
          body: string
          created_at?: string
          daily_cap?: number
          failed?: number
          from_email: string
          from_name: string
          gap_seconds?: number
          id?: string
          locked_until?: string | null
          merge_keys?: Json
          name: string
          reply_to?: string | null
          rotation?: string
          rotation_size?: number
          sent?: number
          source_files?: Json
          status?: string
          subject: string
          team_id?: string | null
          total?: number
          updated_at?: string
          user_id: string
          variants?: Json
        }
        Update: {
          batch_size?: number
          body?: string
          created_at?: string
          daily_cap?: number
          failed?: number
          from_email?: string
          from_name?: string
          gap_seconds?: number
          id?: string
          locked_until?: string | null
          merge_keys?: Json
          name?: string
          reply_to?: string | null
          rotation?: string
          rotation_size?: number
          sent?: number
          source_files?: Json
          status?: string
          subject?: string
          team_id?: string | null
          total?: number
          updated_at?: string
          user_id?: string
          variants?: Json
        }
        Relationships: [
          {
            foreignKeyName: "bulk_sends_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_invite_clicks: {
        Row: {
          campaign_id: string
          clicked_at: string
          id: string
          invite_id: string
          referrer: string | null
          team_id: string
          user_agent: string | null
        }
        Insert: {
          campaign_id: string
          clicked_at?: string
          id?: string
          invite_id: string
          referrer?: string | null
          team_id: string
          user_agent?: string | null
        }
        Update: {
          campaign_id?: string
          clicked_at?: string
          id?: string
          invite_id?: string
          referrer?: string | null
          team_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_invite_clicks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_invite_clicks_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "campaign_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_invite_clicks_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_invites: {
        Row: {
          campaign_id: string
          clicks: number
          code: string
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          last_clicked_at: string | null
          team_id: string
        }
        Insert: {
          campaign_id: string
          clicks?: number
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          last_clicked_at?: string | null
          team_id: string
        }
        Update: {
          campaign_id?: string
          clicks?: number
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          last_clicked_at?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_invites_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
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
          target: number
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
          target?: number
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
          target?: number
        }
        Relationships: []
      }
      email_events: {
        Row: {
          created_at: string
          email: string | null
          event_key: string
          event_type: string
          id: string
          occurred_at: string
          payload: Json
          provider_id: string | null
          recipient_id: string | null
          send_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          event_key: string
          event_type: string
          id?: string
          occurred_at?: string
          payload?: Json
          provider_id?: string | null
          recipient_id?: string | null
          send_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          event_key?: string
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json
          provider_id?: string | null
          recipient_id?: string | null
          send_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_events_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "bulk_send_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_send_id_fkey"
            columns: ["send_id"]
            isOneToOne: false
            referencedRelation: "bulk_sends"
            referencedColumns: ["id"]
          },
        ]
      }
      email_settings: {
        Row: {
          created_at: string
          from_domain: string
          from_local: string
          from_name: string
          reply_to: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          from_domain?: string
          from_local?: string
          from_name?: string
          reply_to?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          from_domain?: string
          from_local?: string
          from_name?: string
          reply_to?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_suppressions: {
        Row: {
          created_at: string
          email: string
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          reason?: string
        }
        Update: {
          created_at?: string
          email?: string
          reason?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body: string
          category: string
          created_at: string
          id: string
          name: string
          subject: string
          user_id: string
        }
        Insert: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          name: string
          subject?: string
          user_id: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          name?: string
          subject?: string
          user_id?: string
        }
        Relationships: []
      }
      followup_deliveries: {
        Row: {
          created_at: string
          email: string
          error: string | null
          id: string
          provider_id: string | null
          recipient_id: string
          sent_at: string | null
          sequence_id: string
          status: string
          step_id: string
          user_id: string
          variant: number
        }
        Insert: {
          created_at?: string
          email: string
          error?: string | null
          id?: string
          provider_id?: string | null
          recipient_id: string
          sent_at?: string | null
          sequence_id: string
          status?: string
          step_id: string
          user_id: string
          variant?: number
        }
        Update: {
          created_at?: string
          email?: string
          error?: string | null
          id?: string
          provider_id?: string | null
          recipient_id?: string
          sent_at?: string | null
          sequence_id?: string
          status?: string
          step_id?: string
          user_id?: string
          variant?: number
        }
        Relationships: [
          {
            foreignKeyName: "followup_deliveries_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "bulk_send_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_deliveries_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "followup_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_deliveries_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "followup_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_sequences: {
        Row: {
          audience_mode: string
          batch_size: number
          created_at: string
          exclude_clicked: boolean
          exclude_opened: boolean
          exclude_replied: boolean
          gap_seconds: number
          id: string
          name: string
          send_hour: number
          send_id: string
          send_minute: number
          status: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          audience_mode?: string
          batch_size?: number
          created_at?: string
          exclude_clicked?: boolean
          exclude_opened?: boolean
          exclude_replied?: boolean
          gap_seconds?: number
          id?: string
          name: string
          send_hour?: number
          send_id: string
          send_minute?: number
          status?: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          audience_mode?: string
          batch_size?: number
          created_at?: string
          exclude_clicked?: boolean
          exclude_opened?: boolean
          exclude_replied?: boolean
          gap_seconds?: number
          id?: string
          name?: string
          send_hour?: number
          send_id?: string
          send_minute?: number
          status?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "followup_sequences_send_id_fkey"
            columns: ["send_id"]
            isOneToOne: false
            referencedRelation: "bulk_sends"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_steps: {
        Row: {
          anchor: string
          completed_at: string | null
          created_at: string
          delay_days: number
          error: string | null
          failed: number
          id: string
          position: number
          rotation: string
          rotation_size: number
          scheduled_at: string | null
          sent: number
          sequence_id: string
          skipped: number
          started_at: string | null
          status: string
          user_id: string
          variants: Json
        }
        Insert: {
          anchor?: string
          completed_at?: string | null
          created_at?: string
          delay_days?: number
          error?: string | null
          failed?: number
          id?: string
          position?: number
          rotation?: string
          rotation_size?: number
          scheduled_at?: string | null
          sent?: number
          sequence_id: string
          skipped?: number
          started_at?: string | null
          status?: string
          user_id: string
          variants?: Json
        }
        Update: {
          anchor?: string
          completed_at?: string | null
          created_at?: string
          delay_days?: number
          error?: string | null
          failed?: number
          id?: string
          position?: number
          rotation?: string
          rotation_size?: number
          scheduled_at?: string | null
          sent?: number
          sequence_id?: string
          skipped?: number
          started_at?: string | null
          status?: string
          user_id?: string
          variants?: Json
        }
        Relationships: [
          {
            foreignKeyName: "followup_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "followup_sequences"
            referencedColumns: ["id"]
          },
        ]
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
          timezone: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email: string
          id: string
          is_active?: boolean
          team_id?: string | null
          timezone?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          is_active?: boolean
          team_id?: string | null
          timezone?: string | null
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
      prospects: {
        Row: {
          assigned_to: string | null
          business_name: string
          campaign_id: string | null
          country: string | null
          created_at: string
          created_by: string | null
          email: string | null
          facebook: string | null
          id: string
          import_batch: string | null
          instagram: string | null
          linkedin: string | null
          notes: string | null
          phone: string | null
          score: number
          source_file: string | null
          stage: string
          team_id: string | null
          tiktok: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          assigned_to?: string | null
          business_name: string
          campaign_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          facebook?: string | null
          id?: string
          import_batch?: string | null
          instagram?: string | null
          linkedin?: string | null
          notes?: string | null
          phone?: string | null
          score?: number
          source_file?: string | null
          stage?: string
          team_id?: string | null
          tiktok?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          assigned_to?: string | null
          business_name?: string
          campaign_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          facebook?: string | null
          id?: string
          import_batch?: string | null
          instagram?: string | null
          linkedin?: string | null
          notes?: string | null
          phone?: string | null
          score?: number
          source_file?: string | null
          stage?: string
          team_id?: string | null
          tiktok?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospects_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_team_id_fkey"
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
      activity_feed: {
        Args: { _campaign_id?: string; _limit?: number }
        Returns: {
          campaign_id: string
          campaign_name: string
          detail: string
          happened_at: string
          kind: string
          team_id: string
          team_name: string
          title: string
        }[]
      }
      campaign_engagement: {
        Args: { _campaign_id: string }
        Returns: {
          clicked: number
          generated: number
          invite_code: string
          joined_at: string
          last_open: string
          link_opens: number
          target: number
          team_id: string
          team_name: string
        }[]
      }
      campaign_opens_summary: {
        Args: never
        Returns: {
          campaign_id: string
          clicked: number
          ends_on: string
          generated: number
          is_active: boolean
          name: string
          opens: number
          starts_on: string
          teams_joined: number
        }[]
      }
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
      campaign_totals: {
        Args: { _campaign_id: string }
        Returns: {
          clicked: number
          generated: number
        }[]
      }
      can_view_user: { Args: { _user_id: string }; Returns: boolean }
      claim_bulk_recipients: {
        Args: { _limit: number; _send_id: string }
        Returns: {
          brand: string
          contact_name: string
          domain: string
          email: string
          id: string
          row_data: Json
          variant: number
        }[]
      }
      email_sent_daily: {
        Args: { _days?: number; _user_id?: string }
        Returns: {
          day: string
          sent: number
        }[]
      }
      email_sent_total: { Args: { _user_id?: string }; Returns: number }
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
      outreach_top_domains: {
        Args: {
          _days?: number
          _limit?: number
          _team_id?: string
          _user_id?: string
        }
        Returns: {
          clicked: number
          domain: string
          generated: number
        }[]
      }
      outreach_totals: {
        Args: { _since?: string; _team_id?: string; _user_id?: string }
        Returns: {
          clicked: number
          generated: number
        }[]
      }
      record_invite_click: {
        Args: { _code: string; _referrer?: string; _user_agent?: string }
        Returns: {
          campaign_id: string
          campaign_name: string
          clicks: number
          team_id: string
          team_name: string
        }[]
      }
      release_bulk_send_lock: { Args: { _send_id: string }; Returns: undefined }
      try_lock_bulk_send: {
        Args: { _seconds?: number; _send_id: string }
        Returns: boolean
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
        | "domain"
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
        "domain",
      ],
    },
  },
} as const
