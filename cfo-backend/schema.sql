-- =========================================================================
-- 1. EXTENSIONS & ENUMS
-- =========================================================================
-- Enable UUID Extension (Available by default in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create Enums for restricted choices
CREATE TYPE document_type AS ENUM ('transcript', 'financial_stats', 'presentation', 'other');
CREATE TYPE risk_level AS ENUM ('High', 'Medium', 'Low');
CREATE TYPE feedback_type AS ENUM (
    'good-prediction', 'missed-nuance', 'wrong-priority', 
    'good-answer', 'weak-answer', 'needs-retraining', 
    'false-positive', 'missed-question'
);

-- =========================================================================
-- 2. USERS / PROFILES TABLE
-- =========================================================================
-- Create a public profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  role TEXT DEFAULT 'user', -- e.g., 'admin', 'user'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Helper Function to check if a user is an admin
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Allow users to read their own profile
CREATE POLICY "Users can view own profile" 
ON profiles FOR SELECT 
USING (auth.uid() = id);

-- Allow admins to read all profiles
CREATE POLICY "Admins can view all profiles" 
ON profiles FOR SELECT 
USING (is_admin());

-- =========================================================================
-- 3. CORE APPLICATION TABLES
-- =========================================================================

-- Companies Table
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    ticker VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Earnings Calls Table
CREATE TABLE earnings_calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    fiscal_year INT NOT NULL,
    quarter VARCHAR(2) NOT NULL, -- e.g., 'Q1', 'Q2', 'Q3', 'Q4'
    is_upcoming BOOLEAN DEFAULT FALSE,
    call_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(company_id, fiscal_year, quarter)
);

-- Documents Table
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    earnings_call_id UUID REFERENCES earnings_calls(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL, 
    doc_type document_type NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Actual Questions Table
CREATE TABLE actual_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    earnings_call_id UUID REFERENCES earnings_calls(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    answer_text TEXT,
    answered_by VARCHAR(255),
    category VARCHAR(100),
    question_topics TEXT,
    answer_summary TEXT,
    key_points TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Predicted Questions Table
CREATE TABLE predicted_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    earnings_call_id UUID REFERENCES earnings_calls(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    suggested_answer TEXT,
    category VARCHAR(100),
    risk risk_level,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Predicted vs Actual Comparisons 
CREATE TABLE predicted_vs_actual_comparisons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    earnings_call_id UUID REFERENCES earnings_calls(id) ON DELETE CASCADE,
    predicted_question_id UUID REFERENCES predicted_questions(id) ON DELETE SET NULL,
    actual_question_id UUID REFERENCES actual_questions(id) ON DELETE SET NULL,
    similarity_score NUMERIC(5, 2) CHECK (similarity_score >= 0 AND similarity_score <= 100),
    was_asked BOOLEAN NOT NULL DEFAULT FALSE,
    feedback feedback_type,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat Sessions
CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    earnings_call_id UUID REFERENCES earnings_calls(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat Messages
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =========================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES FOR CORE TABLES
-- =========================================================================

-- Enable RLS on all primary tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE earnings_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE actual_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE predicted_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE predicted_vs_actual_comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Allow select for authenticated
CREATE POLICY "Allow select for authenticated" ON companies FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow select for authenticated" ON earnings_calls FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow select for authenticated" ON documents FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow select for authenticated" ON actual_questions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow select for authenticated" ON predicted_questions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow select for authenticated" ON predicted_vs_actual_comparisons FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow select for authenticated" ON chat_sessions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow select for authenticated" ON chat_messages FOR SELECT USING (auth.role() = 'authenticated');

-- Allow insert/update for auth
CREATE POLICY "Allow insert/update for auth" ON companies FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow update for auth" ON companies FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow insert/update for auth" ON earnings_calls FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow update for auth" ON earnings_calls FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow insert/update for auth" ON documents FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow update for auth" ON documents FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow insert/update for auth" ON actual_questions FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow update for auth" ON actual_questions FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow insert/update for auth" ON predicted_questions FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow update for auth" ON predicted_questions FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow insert/update for auth" ON predicted_vs_actual_comparisons FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow update for auth" ON predicted_vs_actual_comparisons FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow insert/update for auth" ON chat_sessions FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow update for auth" ON chat_sessions FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow insert/update for auth" ON chat_messages FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow update for auth" ON chat_messages FOR UPDATE USING (auth.role() = 'authenticated');

-- Restrictive Policies (Delete) -> Admins Only
CREATE POLICY "Admins only can delete companies" ON companies FOR DELETE USING (is_admin());
CREATE POLICY "Admins only can delete earnings_calls" ON earnings_calls FOR DELETE USING (is_admin());
CREATE POLICY "Admins only can delete documents" ON documents FOR DELETE USING (is_admin());
CREATE POLICY "Admins only can delete actual_questions" ON actual_questions FOR DELETE USING (is_admin());
CREATE POLICY "Admins only can delete predicted_questions" ON predicted_questions FOR DELETE USING (is_admin());
CREATE POLICY "Admins only can delete comparisons" ON predicted_vs_actual_comparisons FOR DELETE USING (is_admin());
CREATE POLICY "Admins only can delete chat_sessions" ON chat_sessions FOR DELETE USING (is_admin());
CREATE POLICY "Admins only can delete chat_messages" ON chat_messages FOR DELETE USING (is_admin());
