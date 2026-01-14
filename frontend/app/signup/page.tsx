'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { Loader2, PenTool, Gift } from 'lucide-react';

export default function SignUpPage() {
    const { signUp, isLoading: authLoading } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [passwordError, setPasswordError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!email || !password || !confirmPassword) return;
        
        if (password !== confirmPassword) {
            setPasswordError('Passwords do not match');
            return;
        }
        
        if (password.length < 6) {
            setPasswordError('Password must be at least 6 characters');
            return;
        }
        
        setPasswordError('');
        setIsSubmitting(true);
        await signUp({ email, password });
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
                        Create your account
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        Start your creative journey with RyteAI
                    </p>
                </div>

                {/* Credits Badge */}
                <div className="flex items-center justify-center mb-6">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 border border-emerald-200">
                        <Gift className="w-4 h-4 text-emerald-600" />
                        <span className="text-sm text-emerald-700 font-medium">
                            Get 10 free AI credits on signup!
                        </span>
                    </div>
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
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    setPasswordError('');
                                }}
                                className="h-11"
                                required
                                disabled={isLoading}
                                minLength={6}
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
                                Confirm Password
                            </label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => {
                                    setConfirmPassword(e.target.value);
                                    setPasswordError('');
                                }}
                                className="h-11"
                                required
                                disabled={isLoading}
                                minLength={6}
                            />
                            {passwordError && (
                                <p className="text-destructive text-sm mt-1">{passwordError}</p>
                            )}
                        </div>

                        <Button
                            type="submit"
                            className="w-full h-11"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Creating account...
                                </>
                            ) : (
                                'Create account'
                            )}
                        </Button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-muted-foreground text-sm">
                            Already have an account?{' '}
                            <Link 
                                href="/login" 
                                className="text-foreground hover:underline font-medium"
                            >
                                Sign in
                            </Link>
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-muted-foreground text-xs mt-8">
                    By signing up, you agree to our Terms of Service and Privacy Policy.
                </p>
            </div>
        </div>
    );
}
