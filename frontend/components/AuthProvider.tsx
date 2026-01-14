'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
    user: User | null;
    session: Session | null;
    isLoading: boolean;
    credits: number | null;
    isAuthenticated: boolean;
    signUp: (data: { email: string; password: string }) => Promise<{ error: unknown }>;
    signIn: (data: { email: string; password: string }) => Promise<{ error: unknown }>;
    signOut: () => Promise<void>;
    getAccessToken: () => Promise<string | null>;
    refreshCredits: () => Promise<void>;
    updateCredits: (credits: number) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const auth = useAuth();

    return (
        <AuthContext.Provider value={auth}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuthContext() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuthContext must be used within an AuthProvider');
    }
    return context;
}
