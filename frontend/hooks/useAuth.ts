'use client';

import { useState, useEffect, useCallback } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface AuthState {
    user: User | null;
    session: Session | null;
    isLoading: boolean;
    credits: number | null;
}

interface SignUpData {
    email: string;
    password: string;
}

interface SignInData {
    email: string;
    password: string;
}

export function useAuth() {
    const [authState, setAuthState] = useState<AuthState>({
        user: null,
        session: null,
        isLoading: true,
        credits: null,
    });
    const router = useRouter();

    // Fetch user credits from their profile
    const fetchCredits = useCallback(async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('credits')
                .eq('user_id', userId)
                .single();

            if (error) {
                console.error('Error fetching credits:', error);
                return null;
            }

            return data?.credits ?? null;
        } catch (error) {
            console.error('Error fetching credits:', error);
            return null;
        }
    }, []);

    // Initialize auth state
    useEffect(() => {
        const initAuth = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                
                let credits = null;
                if (session?.user) {
                    credits = await fetchCredits(session.user.id);
                }

                setAuthState({
                    user: session?.user ?? null,
                    session: session,
                    isLoading: false,
                    credits,
                });
            } catch (error) {
                console.error('Error initializing auth:', error);
                setAuthState(prev => ({ ...prev, isLoading: false }));
            }
        };

        initAuth();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                let credits = null;
                if (session?.user) {
                    credits = await fetchCredits(session.user.id);
                }

                setAuthState({
                    user: session?.user ?? null,
                    session: session,
                    isLoading: false,
                    credits,
                });

                // Handle specific auth events
                if (event === 'SIGNED_IN') {
                    router.push('/');
                } else if (event === 'SIGNED_OUT') {
                    router.push('/login');
                }
            }
        );

        return () => {
            subscription.unsubscribe();
        };
    }, [router, fetchCredits]);

    // Sign up with email and password
    const signUp = useCallback(async ({ email, password }: SignUpData): Promise<{ error: AuthError | null }> => {
        try {
            const { error } = await supabase.auth.signUp({
                email,
                password,
            });

            if (error) {
                toast.error(error.message);
                return { error };
            }

            toast.success('Account created! Please check your email to verify your account.');
            return { error: null };
        } catch (error) {
            const authError = error as AuthError;
            toast.error(authError.message || 'Failed to sign up');
            return { error: authError };
        }
    }, []);

    // Sign in with email and password
    const signIn = useCallback(async ({ email, password }: SignInData): Promise<{ error: AuthError | null }> => {
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                toast.error(error.message);
                return { error };
            }

            toast.success('Welcome back!');
            return { error: null };
        } catch (error) {
            const authError = error as AuthError;
            toast.error(authError.message || 'Failed to sign in');
            return { error: authError };
        }
    }, []);

    // Sign out
    const signOut = useCallback(async () => {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) {
                toast.error(error.message);
            } else {
                toast.success('Signed out successfully');
            }
        } catch (error) {
            console.error('Error signing out:', error);
            toast.error('Failed to sign out');
        }
    }, []);

    // Get access token for API calls
    const getAccessToken = useCallback(async (): Promise<string | null> => {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token ?? null;
    }, []);

    // Refresh credits (call after AI operations)
    const refreshCredits = useCallback(async () => {
        if (authState.user) {
            const credits = await fetchCredits(authState.user.id);
            setAuthState(prev => ({ ...prev, credits }));
        }
    }, [authState.user, fetchCredits]);

    // Update credits locally (optimistic update)
    const updateCredits = useCallback((newCredits: number) => {
        setAuthState(prev => ({ ...prev, credits: newCredits }));
    }, []);

    return {
        user: authState.user,
        session: authState.session,
        isLoading: authState.isLoading,
        credits: authState.credits,
        isAuthenticated: !!authState.session,
        signUp,
        signIn,
        signOut,
        getAccessToken,
        refreshCredits,
        updateCredits,
    };
}
