import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PenTool } from "lucide-react";

export default function Home() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 flex items-center justify-center p-4">
            <div className="max-w-2xl mx-auto text-center space-y-8">
                <div className="space-y-4">
                    <div className="flex items-center justify-center mb-8">
                        <PenTool className="h-16 w-16 text-primary" />
                    </div>
                    <h1 className="text-6xl font-bold tracking-tight text-foreground">
                        RyteAI
                    </h1>
                    <p className="text-xl text-muted-foreground leading-relaxed">
                        Create, edit, and collaborate on documents with our powerful canvas editor.
                        Bring your ideas to life with an intuitive and feature-rich writing experience.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Button asChild size="lg" className="text-lg px-8 py-6">
                        <Link href="/canvas">
                            Get Started
                        </Link>
                    </Button>
                    <Button asChild variant="outline" size="lg" className="text-lg px-8 py-6">
                        <Link href="/canvas">
                            View Canvases
                        </Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
