-- ======================================================================
-- TELEGRAM SYNC HUB & MULTI-USER STUDIO - SUPABASE SCHEMA & RLS POLICIES
-- ======================================================================
-- Execute this script in your Supabase SQL Editor to set up tables,
-- RLS policies, indexes, and automatic triggers for multi-tenant isolation.

-- 1. Create Profiles Table (Stores user metadata and Telegram string sessions)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL,
    telegram_session_string TEXT DEFAULT NULL,
    telegram_phone TEXT DEFAULT NULL,
    telegram_first_name TEXT DEFAULT NULL,
    telegram_username TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create User Settings Table (Per-user channel routing, webhooks, & transformation rules)
CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    webhook_url TEXT DEFAULT 'https://n8n.getaipilot.in/webhook/telegram_sync',
    source_channel_id TEXT DEFAULT 'all',
    destination_channel_id TEXT DEFAULT '',
    auto_post_telegram BOOLEAN DEFAULT true,
    auto_post_n8n BOOLEAN DEFAULT true,
    text_prefix TEXT DEFAULT '',
    text_suffix TEXT DEFAULT '',
    find_text TEXT DEFAULT '',
    replace_text TEXT DEFAULT '',
    replacement_rules JSONB DEFAULT '[]'::jsonb,
    override_all_links BOOLEAN DEFAULT false,
    custom_link_url TEXT DEFAULT '',
    remove_all_links BOOLEAN DEFAULT false,
    keyword_filter TEXT DEFAULT '',
    filter_mode TEXT DEFAULT 'all',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create Sync Logs Table (Per-user sync activity history)
CREATE TABLE IF NOT EXISTS public.sync_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    telegram_message_id BIGINT,
    chat_id BIGINT,
    chat_name TEXT DEFAULT '',
    raw_message TEXT DEFAULT '',
    transformed_message TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    reason TEXT DEFAULT '',
    webhook_url TEXT DEFAULT '',
    telegram_posted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create Subscriptions Table (Per-user Razorpay subscription management)
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    plan_id TEXT NOT NULL DEFAULT 'free',
    plan_name TEXT NOT NULL DEFAULT 'Free Tier',
    amount_paid NUMERIC DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    razorpay_order_id TEXT DEFAULT NULL,
    razorpay_payment_id TEXT DEFAULT NULL,
    current_period_start TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Enable Row Level Security (RLS) on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS Policies for Profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" 
    ON public.profiles FOR SELECT 
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" 
    ON public.profiles FOR UPDATE 
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" 
    ON public.profiles FOR INSERT 
    WITH CHECK (auth.uid() = id);

-- 7. Create RLS Policies for User Settings
DROP POLICY IF EXISTS "Users can view own settings" ON public.user_settings;
CREATE POLICY "Users can view own settings" 
    ON public.user_settings FOR SELECT 
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;
CREATE POLICY "Users can update own settings" 
    ON public.user_settings FOR UPDATE 
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own settings" ON public.user_settings;
CREATE POLICY "Users can insert own settings" 
    ON public.user_settings FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- 8. Create RLS Policies for Sync Logs
DROP POLICY IF EXISTS "Users can view own sync logs" ON public.sync_logs;
CREATE POLICY "Users can view own sync logs" 
    ON public.sync_logs FOR SELECT 
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own sync logs" ON public.sync_logs;
CREATE POLICY "Users can insert own sync logs" 
    ON public.sync_logs FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own sync logs" ON public.sync_logs;
CREATE POLICY "Users can delete own sync logs" 
    ON public.sync_logs FOR DELETE 
    USING (auth.uid() = user_id);

-- 9. Create RLS Policies for Subscriptions
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
CREATE POLICY "Users can view own subscription" 
    ON public.subscriptions FOR SELECT 
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own subscription" ON public.subscriptions;
CREATE POLICY "Users can update own subscription" 
    ON public.subscriptions FOR UPDATE 
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own subscription" ON public.subscriptions;
CREATE POLICY "Users can insert own subscription" 
    ON public.subscriptions FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- 10. Automatic Profile, Settings & Subscription Creation Trigger on Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert into public.profiles
    INSERT INTO public.profiles (id, email, telegram_session_string, created_at, updated_at)
    VALUES (NEW.id, NEW.email, NULL, now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- Insert default row into public.user_settings
    INSERT INTO public.user_settings (user_id, created_at, updated_at)
    VALUES (NEW.id, now(), now())
    ON CONFLICT (user_id) DO NOTHING;

    -- Insert default row into public.subscriptions
    INSERT INTO public.subscriptions (user_id, plan_id, plan_name, amount_paid, status, created_at, updated_at)
    VALUES (NEW.id, 'free', 'Free Tier', 0, 'active', now(), now())
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind Trigger to auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 11. Create Performance Indexes
CREATE INDEX IF NOT EXISTS idx_sync_logs_user_id ON public.sync_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON public.sync_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_session ON public.profiles(telegram_session_string) WHERE telegram_session_string IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
