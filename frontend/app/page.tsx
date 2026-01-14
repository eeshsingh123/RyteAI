'use client';

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PenTool, LogOut, Coins } from "lucide-react";
import { useAuthContext } from "@/components/AuthProvider";

export default function Home() {
    const { user, credits, signOut, isAuthenticated } = useAuthContext();

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center border-b">
                <div className="flex items-center gap-2">
                    <PenTool className="h-6 w-6 text-foreground" />
                    <span className="font-semibold text-foreground">RyteAI</span>
                </div>
                <div className="flex items-center gap-4">
                    {isAuthenticated ? (
                        <>
                            {/* Credits Badge */}
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border">
                                <Coins className="w-4 h-4 text-amber-500" />
                                <span className="text-sm font-medium text-foreground">
                                    {credits ?? '—'} credits
                                </span>
                            </div>
                            {/* User Email */}
                            <span className="text-sm text-muted-foreground hidden sm:block">
                                {user?.email}
                            </span>
                            {/* Sign Out Button */}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={signOut}
                            >
                                <LogOut className="w-4 h-4 mr-2" />
                                Sign out
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="ghost" size="sm" asChild>
                                <Link href="/login">Sign in</Link>
                            </Button>
                            <Button size="sm" asChild>
                                <Link href="/signup">Sign up</Link>
                            </Button>
                        </>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="max-w-2xl mx-auto text-center space-y-8">
                    <div className="space-y-4">
                        <div className="flex items-center justify-center mb-8">
                            <div className="w-20 h-20 rounded-2xl bg-foreground flex items-center justify-center">
                                <PenTool className="h-10 w-10 text-background" />
                            </div>
                        </div>
                        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-foreground">
                            Welcome to RyteAI
                        </h1>
                        <p className="text-xl text-muted-foreground leading-relaxed max-w-lg mx-auto">
                            Create, edit, and collaborate on documents with our powerful AI-assisted canvas editor.
                            Bring your ideas to life.
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Button 
                            asChild 
                            size="lg" 
                            className="text-lg px-8 py-6"
                        >
                            <Link href={isAuthenticated ? "/canvas" : "/signup"}>
                                Get Started
                            </Link>
                        </Button>
                        <Button 
                            asChild 
                            variant="outline" 
                            size="lg" 
                            className="text-lg px-8 py-6"
                        >
                            <Link href={isAuthenticated ? "/canvas" : "/login"}>
                                View Your Canvases
                            </Link>
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
