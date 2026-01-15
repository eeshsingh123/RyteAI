'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from './AuthProvider';
import { PenTool } from 'lucide-react';

interface AuthGuardProps {
    children: React.ReactNode;
}

const loadingQuotes = [
    "Great writing is rewriting...",
    "Every word matters...",
    "Crafting your experience...",
    "Ideas taking shape...",
    "Your canvas awaits...",
    "Preparing your workspace...",
    "Creativity is thinking up new things...",
    "Writing is the painting of the voice..."
];

export function AuthGuard({ children }: AuthGuardProps) {
    const { isAuthenticated, isLoading } = useAuthContext();
    const router = useRouter();
    const [quote, setQuote] = useState('');

    useEffect(() => {
        // Set a random quote when component mounts
        setQuote(loadingQuotes[Math.floor(Math.random() * loadingQuotes.length)]);
    }, []);

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push('/login');
        }
    }, [isAuthenticated, isLoading, router]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-6">
                    <div className="w-16 h-16 rounded-2xl bg-foreground flex items-center justify-center animate-pulse">
                        <PenTool className="h-8 w-8 text-background" />
                    </div>
                    <p className="text-muted-foreground text-sm font-medium animate-pulse">
                        {quote}
                    </p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return null;
    }

    return <>{children}</>;
}
