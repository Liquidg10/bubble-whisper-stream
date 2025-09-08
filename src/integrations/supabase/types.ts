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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          ai_response: string
          context: Json | null
          conversation_thread_id: string | null
          created_at: string
          id: string
          mode: string | null
          session_start: boolean | null
          summary: string | null
          updated_at: string
          user_id: string
          user_message: string
        }
        Insert: {
          ai_response: string
          context?: Json | null
          conversation_thread_id?: string | null
          created_at?: string
          id?: string
          mode?: string | null
          session_start?: boolean | null
          summary?: string | null
          updated_at?: string
          user_id: string
          user_message: string
        }
        Update: {
          ai_response?: string
          context?: Json | null
          conversation_thread_id?: string | null
          created_at?: string
          id?: string
          mode?: string | null
          session_start?: boolean | null
          summary?: string | null
          updated_at?: string
          user_id?: string
          user_message?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          booking_date: string
          created_at: string
          guest_email: string
          guest_name: string
          guest_phone: string | null
          id: string
          notes: string | null
          service_fee: number
          status: string | null
          subtotal: number
          tax_amount: number
          tenant_id: string
          ticket_details: Json
          time_slot: string | null
          total_amount: number
          total_guests: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          booking_date: string
          created_at?: string
          guest_email: string
          guest_name: string
          guest_phone?: string | null
          id?: string
          notes?: string | null
          service_fee?: number
          status?: string | null
          subtotal?: number
          tax_amount?: number
          tenant_id: string
          ticket_details?: Json
          time_slot?: string | null
          total_amount?: number
          total_guests?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          booking_date?: string
          created_at?: string
          guest_email?: string
          guest_name?: string
          guest_phone?: string | null
          id?: string
          notes?: string | null
          service_fee?: number
          status?: string | null
          subtotal?: number
          tax_amount?: number
          tenant_id?: string
          ticket_details?: Json
          time_slot?: string | null
          total_amount?: number
          total_guests?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_accounts: {
        Row: {
          account_email: string
          account_name: string
          calendar_id: string | null
          calendar_name: string | null
          created_at: string
          id: string
          is_primary: boolean | null
          last_sync_at: string | null
          oauth_token_id: string
          provider: string
          sync_enabled: boolean | null
          sync_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_email: string
          account_name: string
          calendar_id?: string | null
          calendar_name?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean | null
          last_sync_at?: string | null
          oauth_token_id: string
          provider: string
          sync_enabled?: boolean | null
          sync_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_email?: string
          account_name?: string
          calendar_id?: string | null
          calendar_name?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean | null
          last_sync_at?: string | null
          oauth_token_id?: string
          provider?: string
          sync_enabled?: boolean | null
          sync_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_accounts_oauth_token_id_fkey"
            columns: ["oauth_token_id"]
            isOneToOne: false
            referencedRelation: "oauth_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          attendees: Json | null
          bubble_created: boolean | null
          calendar_account_id: string
          created_at: string
          description: string | null
          end_time: string
          external_event_id: string
          id: string
          location: string | null
          reminder_created: boolean | null
          start_time: string
          status: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attendees?: Json | null
          bubble_created?: boolean | null
          calendar_account_id: string
          created_at?: string
          description?: string | null
          end_time: string
          external_event_id: string
          id?: string
          location?: string | null
          reminder_created?: boolean | null
          start_time: string
          status?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attendees?: Json | null
          bubble_created?: boolean | null
          calendar_account_id?: string
          created_at?: string
          description?: string | null
          end_time?: string
          external_event_id?: string
          id?: string
          location?: string | null
          reminder_created?: boolean | null
          start_time?: string
          status?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_calendar_account_id_fkey"
            columns: ["calendar_account_id"]
            isOneToOne: false
            referencedRelation: "calendar_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_summaries: {
        Row: {
          created_at: string | null
          id: string
          key_topics: string[] | null
          message_count: number
          summary_text: string
          thread_id: string
          time_period_end: string
          time_period_start: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          key_topics?: string[] | null
          message_count: number
          summary_text: string
          thread_id: string
          time_period_end: string
          time_period_start: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          key_topics?: string[] | null
          message_count?: number
          summary_text?: string
          thread_id?: string
          time_period_end?: string
          time_period_start?: string
          user_id?: string
        }
        Relationships: []
      }
      conversation_threads: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          last_message_at: string | null
          message_count: number | null
          title: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_message_at?: string | null
          message_count?: number | null
          title?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_message_at?: string | null
          message_count?: number | null
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      email_accounts: {
        Row: {
          account_email: string
          account_name: string | null
          created_at: string
          filters: Json | null
          id: string
          last_sync_at: string | null
          oauth_token_id: string
          provider: string
          sync_enabled: boolean | null
          sync_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_email: string
          account_name?: string | null
          created_at?: string
          filters?: Json | null
          id?: string
          last_sync_at?: string | null
          oauth_token_id: string
          provider: string
          sync_enabled?: boolean | null
          sync_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_email?: string
          account_name?: string | null
          created_at?: string
          filters?: Json | null
          id?: string
          last_sync_at?: string | null
          oauth_token_id?: string
          provider?: string
          sync_enabled?: boolean | null
          sync_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_accounts_oauth_token_id_fkey"
            columns: ["oauth_token_id"]
            isOneToOne: false
            referencedRelation: "oauth_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          body_preview: string | null
          bubble_created: boolean | null
          created_at: string
          email_account_id: string
          external_message_id: string
          id: string
          importance_score: number | null
          labels: Json | null
          received_at: string
          sender_email: string
          sender_name: string | null
          subject: string
          thread_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body_preview?: string | null
          bubble_created?: boolean | null
          created_at?: string
          email_account_id: string
          external_message_id: string
          id?: string
          importance_score?: number | null
          labels?: Json | null
          received_at: string
          sender_email: string
          sender_name?: string | null
          subject: string
          thread_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body_preview?: string | null
          bubble_created?: boolean | null
          created_at?: string
          email_account_id?: string
          external_message_id?: string
          id?: string
          importance_score?: number | null
          labels?: Json | null
          received_at?: string
          sender_email?: string
          sender_name?: string | null
          subject?: string
          thread_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_email_account_id_fkey"
            columns: ["email_account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_audit_log: {
        Row: {
          amount: number
          booking_id: string | null
          created_at: string
          details: Json | null
          event_type: string
          gift_card_id: string | null
          id: string
          order_id: string | null
          payment_method: string | null
          performed_by: string | null
          stripe_payment_intent_id: string | null
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          amount: number
          booking_id?: string | null
          created_at?: string
          details?: Json | null
          event_type: string
          gift_card_id?: string | null
          id?: string
          order_id?: string | null
          payment_method?: string | null
          performed_by?: string | null
          stripe_payment_intent_id?: string | null
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string | null
          created_at?: string
          details?: Json | null
          event_type?: string
          gift_card_id?: string | null
          id?: string
          order_id?: string | null
          payment_method?: string | null
          performed_by?: string | null
          stripe_payment_intent_id?: string | null
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_audit_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_audit_log_gift_card_id_fkey"
            columns: ["gift_card_id"]
            isOneToOne: false
            referencedRelation: "gift_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_audit_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_transactions: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          gift_card_id: string
          id: string
          notes: string | null
          order_id: string | null
          performed_by: string | null
          tenant_id: string
          transaction_type: string
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          gift_card_id: string
          id?: string
          notes?: string | null
          order_id?: string | null
          performed_by?: string | null
          tenant_id: string
          transaction_type: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          gift_card_id?: string
          id?: string
          notes?: string | null
          order_id?: string | null
          performed_by?: string | null
          tenant_id?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_transactions_gift_card_id_fkey"
            columns: ["gift_card_id"]
            isOneToOne: false
            referencedRelation: "gift_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_cards: {
        Row: {
          code: string
          created_at: string
          current_balance: number
          expires_at: string | null
          id: string
          initial_amount: number
          is_active: boolean | null
          original_amount: number
          purchase_order_id: string | null
          purchased_by: string | null
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          current_balance: number
          expires_at?: string | null
          id?: string
          initial_amount: number
          is_active?: boolean | null
          original_amount: number
          purchase_order_id?: string | null
          purchased_by?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          current_balance?: number
          expires_at?: string | null
          id?: string
          initial_amount?: number
          is_active?: boolean | null
          original_amount?: number
          purchase_order_id?: string | null
          purchased_by?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_cards_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_cards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_accounts: {
        Row: {
          access_token: string | null
          account_email: string | null
          created_at: string
          expires_at: string | null
          id: string
          last_used_at: string | null
          provider: string
          provider_user_id: string
          refresh_token: string | null
          scopes: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          account_email?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          provider: string
          provider_user_id: string
          refresh_token?: string | null
          scopes?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          account_email?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          provider?: string
          provider_user_id?: string
          refresh_token?: string | null
          scopes?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      oauth_tokens: {
        Row: {
          access_token: string
          account_email: string
          created_at: string
          id: string
          provider: string
          refresh_token: string | null
          scope: string
          service_type: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          account_email: string
          created_at?: string
          id?: string
          provider: string
          refresh_token?: string | null
          scope: string
          service_type: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          account_email?: string
          created_at?: string
          id?: string
          provider?: string
          refresh_token?: string | null
          scope?: string
          service_type?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount: number
          booking_id: string | null
          created_at: string
          gift_card_applied: number
          id: string
          payment_method: string | null
          refund_amount: number
          refund_reason: string | null
          refunded_at: string | null
          status: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          subtotal: number
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          booking_id?: string | null
          created_at?: string
          gift_card_applied?: number
          id?: string
          payment_method?: string | null
          refund_amount?: number
          refund_reason?: string | null
          refunded_at?: string | null
          status?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          subtotal?: number
          tenant_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string | null
          created_at?: string
          gift_card_applied?: number
          id?: string
          payment_method?: string | null
          refund_amount?: number
          refund_reason?: string | null
          refunded_at?: string | null
          status?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          subtotal?: number
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plaid_items: {
        Row: {
          access_token: string
          created_at: string
          id: string
          institution_name: string
          is_active: boolean | null
          item_id: string
          last_sync_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          id?: string
          institution_name: string
          is_active?: boolean | null
          item_id: string
          last_sync_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          id?: string
          institution_name?: string
          is_active?: boolean | null
          item_id?: string
          last_sync_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          email_verified: boolean | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          email_verified?: boolean | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          email_verified?: boolean | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_conflicts: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          local_data: string
          local_timestamp: string
          remote_data: string
          remote_timestamp: string
          resolution: string | null
          resolved_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          local_data: string
          local_timestamp: string
          remote_data: string
          remote_timestamp: string
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          local_data?: string
          local_timestamp?: string
          remote_data?: string
          remote_timestamp?: string
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      sync_data: {
        Row: {
          created_at: string
          data_encrypted: string
          device_id: string
          entity_id: string
          entity_type: string
          id: string
          iv: string
          operation: string
          timestamp: string
          user_id: string
          version: string
        }
        Insert: {
          created_at?: string
          data_encrypted: string
          device_id: string
          entity_id: string
          entity_type: string
          id?: string
          iv: string
          operation: string
          timestamp?: string
          user_id: string
          version: string
        }
        Update: {
          created_at?: string
          data_encrypted?: string
          device_id?: string
          entity_id?: string
          entity_type?: string
          id?: string
          iv?: string
          operation?: string
          timestamp?: string
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      sync_devices: {
        Row: {
          created_at: string
          device_id: string
          device_name: string
          device_type: string
          id: string
          is_active: boolean
          last_seen: string
          public_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          device_name: string
          device_type: string
          id?: string
          is_active?: boolean
          last_seen?: string
          public_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          device_name?: string
          device_type?: string
          id?: string
          is_active?: boolean
          last_seen?: string
          public_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          account_id: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          items_created: number | null
          items_processed: number | null
          items_updated: number | null
          operation: string
          provider: string
          service_type: string
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          items_created?: number | null
          items_processed?: number | null
          items_updated?: number | null
          operation: string
          provider: string
          service_type: string
          started_at?: string
          status: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          items_created?: number | null
          items_processed?: number | null
          items_updated?: number | null
          operation?: string
          provider?: string
          service_type?: string
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          settings: Json | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          settings?: Json | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          settings?: Json | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_memory: {
        Row: {
          confidence: number | null
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          key: string
          memory_type: string
          source_conversation_id: string | null
          updated_at: string | null
          user_id: string
          value: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key: string
          memory_type: string
          source_conversation_id?: string | null
          updated_at?: string | null
          user_id: string
          value: string
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key?: string
          memory_type?: string
          source_conversation_id?: string | null
          updated_at?: string | null
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          last_accessed_at: string | null
          provider: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          last_accessed_at?: string | null
          provider?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          last_accessed_at?: string | null
          provider?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_tenants: {
        Row: {
          created_at: string
          id: string
          role: string | null
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          role?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_samples: {
        Row: {
          created_at: string
          file_path: string
          id: string
          sample_index: number
          user_id: string
        }
        Insert: {
          created_at?: string
          file_path: string
          id?: string
          sample_index: number
          user_id: string
        }
        Update: {
          created_at?: string
          file_path?: string
          id?: string
          sample_index?: number
          user_id?: string
        }
        Relationships: []
      }
      webhook_subscriptions: {
        Row: {
          account_id: string | null
          created_at: string
          expires_at: string | null
          external_subscription_id: string
          id: string
          is_active: boolean | null
          provider: string
          service_type: string
          updated_at: string
          user_id: string
          webhook_url: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          expires_at?: string | null
          external_subscription_id: string
          id?: string
          is_active?: boolean | null
          provider: string
          service_type: string
          updated_at?: string
          user_id: string
          webhook_url: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          expires_at?: string | null
          external_subscription_id?: string
          id?: string
          is_active?: boolean | null
          provider?: string
          service_type?: string
          updated_at?: string
          user_id?: string
          webhook_url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_tenant_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      is_tenant_admin: {
        Args: { tenant_uuid: string }
        Returns: boolean
      }
      user_belongs_to_tenant: {
        Args: { tenant_uuid: string }
        Returns: boolean
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
