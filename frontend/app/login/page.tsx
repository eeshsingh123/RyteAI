'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { Loader2, PenTool } from 'lucide-react';

export default function LoginPage() {
    const { signIn, isLoading: authLoading } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email || !password) return;

        setIsSubmitting(true);
        await signIn({ email, password });
        setIsSubmitting(false);
    };

    const isLoading = authLoading || isSubmitting;

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="w-full max-w-md mx-4">
                {/* Logo/Brand */}
                <div className="text-center mb-8">
                    <Link href="/" className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-foreground mb-4">
                        <PenTool className="w-8 h-8 text-background" />
                    </Link>
                    <h1 className="text-3xl font-bold text-foreground tracking-tight">
                        Welcome back
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        Sign in to continue to RyteAI
                    </p>
                </div>

                {/* Form Card */}
                <div className="border rounded-lg p-8">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <label htmlFor="email" className="text-sm font-medium text-foreground">
                                Email
                            </label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="h-11"
                                required
                                disabled={isLoading}
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="password" className="text-sm font-medium text-foreground">
                                Password
                            </label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="h-11"
                                required
                                disabled={isLoading}
                                minLength={6}
                            />
                        </div>

                        <Button
                            type="submit"
                            className="w-full h-11"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Signing in...
                                </>
                            ) : (
                                'Sign in'
                            )}
                        </Button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-muted-foreground text-sm">
                            Don&apos;t have an account?{' '}
                            <Link
                                href="/signup"
                                className="text-foreground hover:underline font-medium"
                            >
                                Sign up
                            </Link>
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-muted-foreground text-xs mt-8">
                    By signing in, you agree to our Terms of Service and Privacy Policy.
                </p>
            </div>
        </div>
    );
}
