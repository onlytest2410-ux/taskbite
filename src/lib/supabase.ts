import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vjswhwjbykgqfzqjtdz.supabase.co';
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqeG1od2pqYnlrZ3FmenF6dGR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4MDUwODEsImV4cCI6MjEwNDM4MTA4MX0.g4qgCn6JpZxIrZQrJ97n9oN9Y5YY0-78TTfX3VSszZA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);



