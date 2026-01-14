-- ============================================
-- Supabase Migration: Profiles & Credits System
-- ============================================

-- 1. Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    credits INTEGER NOT NULL DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
-- Allow users to read their own profile
CREATE POLICY "Users can view own profile"
    ON public.profiles
    FOR SELECT
    USING (auth.uid() = user_id);

-- Disallow direct client updates to credits (only service role can update)
-- No INSERT/UPDATE/DELETE policies for authenticated users means they can't modify

-- 4. Trigger function to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (user_id, credits)
    VALUES (NEW.id, 10);
    RETURN NEW;
END;
$$;

-- 5. Trigger on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- 6. RPC function to consume credits (atomic, concurrency-safe)
CREATE OR REPLACE FUNCTION public.consume_credit(p_user_id UUID, p_amount INTEGER DEFAULT 1)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_credits INTEGER;
    v_new_credits INTEGER;
BEGIN
    -- Lock the row for update to prevent race conditions
    SELECT credits INTO v_current_credits
    FROM public.profiles
    WHERE user_id = p_user_id
    FOR UPDATE;

    -- Check if user exists
    IF v_current_credits IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User profile not found',
            'credits_remaining', NULL
        );
    END IF;

    -- Check if sufficient credits
    IF v_current_credits < p_amount THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient credits',
            'credits_remaining', v_current_credits
        );
    END IF;

    -- Deduct credits
    v_new_credits := v_current_credits - p_amount;
    
    UPDATE public.profiles
    SET credits = v_new_credits
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'error', NULL,
        'credits_remaining', v_new_credits
    );
END;
$$;

-- 7. RPC function to refund credits
CREATE OR REPLACE FUNCTION public.refund_credit(p_user_id UUID, p_amount INTEGER DEFAULT 1)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_credits INTEGER;
BEGIN
    UPDATE public.profiles
    SET credits = credits + p_amount
    WHERE user_id = p_user_id
    RETURNING credits INTO v_new_credits;

    IF v_new_credits IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User profile not found',
            'credits_remaining', NULL
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'error', NULL,
        'credits_remaining', v_new_credits
    );
END;
$$;

-- 8. Grant execute permissions on RPC functions to service_role only
-- (These functions use SECURITY DEFINER so they run with owner privileges)
REVOKE ALL ON FUNCTION public.consume_credit(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_credit(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_credit(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_credit(UUID, INTEGER) TO service_role;

-- 9. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
