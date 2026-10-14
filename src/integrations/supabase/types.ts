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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          created_at: string
          id: string
          kind: string
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          message: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          message?: string
          user_id?: string
        }
        Relationships: []
      }
      assignments: {
        Row: {
          actual_minutes: number
          buffer_state: string
          course_id: string | null
          created_at: string
          due_at: string | null
          estimate_source: string | null
          estimated_is_manual: boolean
          estimated_minutes: number | null
          id: string
          lms_assignment_id: string | null
          progress_pct: number
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_minutes?: number
          buffer_state?: string
          course_id?: string | null
          created_at?: string
          due_at?: string | null
          estimate_source?: string | null
          estimated_is_manual?: boolean
          estimated_minutes?: number | null
          id?: string
          lms_assignment_id?: string | null
          progress_pct?: number
          status?: string
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          actual_minutes?: number
          buffer_state?: string
          course_id?: string | null
          created_at?: string
          due_at?: string | null
          estimate_source?: string | null
          estimated_is_manual?: boolean
          estimated_minutes?: number | null
          id?: string
          lms_assignment_id?: string | null
          progress_pct?: number
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      calibration_multipliers: {
        Row: {
          created_at: string
          item_type: string
          multiplier: number
          sample_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          item_type: string
          multiplier?: number
          sample_count?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          item_type?: string
          multiplier?: number
          sample_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      courses: {
        Row: {
          code: string | null
          created_at: string
          id: string
          lms_course_id: string | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          lms_course_id?: string | null
          name: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          lms_course_id?: string | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      detected_items: {
        Row: {
          confidence: string
          confirmed: boolean
          created_at: string
          estimated_minutes: number | null
          id: string
          item_type: string
          signal_value: string | null
          source_course: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: string
          confirmed?: boolean
          created_at?: string
          estimated_minutes?: number | null
          id?: string
          item_type: string
          signal_value?: string | null
          source_course?: string | null
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          confidence?: string
          confirmed?: boolean
          created_at?: string
          estimated_minutes?: number | null
          id?: string
          item_type?: string
          signal_value?: string | null
          source_course?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      estimate_events: {
        Row: {
          actual_minutes: number | null
          assignment_id: string
          calibration_used: boolean | null
          confidence: string
          created_at: string
          estimated_minutes: number
          excluded_reason: string | null
          id: string
          item_type: string
        }
        Insert: {
          actual_minutes?: number | null
          assignment_id: string
          calibration_used?: boolean | null
          confidence?: string
          created_at?: string
          estimated_minutes: number
          excluded_reason?: string | null
          id?: string
          item_type: string
        }
        Update: {
          actual_minutes?: number | null
          assignment_id?: string
          calibration_used?: boolean | null
          confidence?: string
          created_at?: string
          estimated_minutes?: number
          excluded_reason?: string | null
          id?: string
          item_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_events_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      lms_connections: {
        Row: {
          connected_at: string
          created_at: string
          id: string
          provider: string
          site_url: string | null
          token_encrypted: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_at?: string
          created_at?: string
          id?: string
          provider: string
          site_url?: string | null
          token_encrypted?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          connected_at?: string
          created_at?: string
          id?: string
          provider?: string
          site_url?: string | null
          token_encrypted?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      steps: {
        Row: {
          assignment_id: string
          created_at: string
          done_criteria: Json
          id: string
          order_index: number
          scheduled_date: string | null
          status: string
          timebox_minutes: number
          title: string
          updated_at: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          done_criteria?: Json
          id?: string
          order_index: number
          scheduled_date?: string | null
          status?: string
          timebox_minutes?: number
          title: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          done_criteria?: Json
          id?: string
          order_index?: number
          scheduled_date?: string | null
          status?: string
          timebox_minutes?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "steps_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      users_settings: {
        Row: {
          created_at: string
          timezone: string
          updated_at: string
          user_id: string
          weekly_available_hours: number
        }
        Insert: {
          created_at?: string
          timezone?: string
          updated_at?: string
          user_id: string
          weekly_available_hours?: number
        }
        Update: {
          created_at?: string
          timezone?: string
          updated_at?: string
          user_id?: string
          weekly_available_hours?: number
        }
        Relationships: []
      }
      weekly_allocations: {
        Row: {
          allocated_minutes: number
          assignment_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          allocated_minutes?: number
          assignment_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          week_start: string
        }
        Update: {
          allocated_minutes?: number
          assignment_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_allocations_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      owns_assignment: { Args: { _assignment_id: string }; Returns: boolean }
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
    Enums: {},
  },
} as const
