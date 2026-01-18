"use client";

import { useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    SidebarInset,
    SidebarProvider,
} from "@/components/ui/sidebar";
import { Plus, FileText } from "lucide-react";
import { useCanvasApi } from "@/hooks/useCanvasApi";
import { CanvasSidebar } from "@/components/CanvasSidebar";
import { AuthGuard } from "@/components/AuthGuard";

function CanvasPageContent() {
    const router = useRouter();
    const {
        isLoading,
        canvases,
        getCanvases,
        createCanvas,
        deleteCanvas,
        toggleFavorite,
    } = useCanvasApi();

    // Ref to prevent duplicate fetches on mount
    const hasFetchedCanvases = useRef(false);

    // Load canvases on mount only once
    useEffect(() => {
        // Only fetch if we haven't already
        if (hasFetchedCanvases.current) return;
        hasFetchedCanvases.current = true;
        getCanvases();
        
        // Reset the ref on unmount to handle StrictMode double-mounting
        return () => {
            hasFetchedCanvases.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Create new canvas
    const handleCreateCanvas = async () => {
        const newCanvas = await createCanvas({
            name: 'Untitled Canvas',
            description: '',
            content: {}
        });

        if (newCanvas) {
            router.push(`/canvas/${newCanvas.id}`);
        }
    };

    // Handle delete canvas
    const handleDeleteCanvas = useCallback(async (canvasId: string) => {
        await deleteCanvas(canvasId);
    }, [deleteCanvas]);

    // Toggle favorite status
    const handleToggleFavorite = async (canvasId: string, isFavorite: boolean) => {
        await toggleFavorite(canvasId, isFavorite);
    };

    return (
        <SidebarProvider defaultOpen={true}>
            <CanvasSidebar
                canvases={canvases}
                onCreateCanvas={handleCreateCanvas}
                onToggleFavorite={handleToggleFavorite}
                onDelete={handleDeleteCanvas}
                isLoading={isLoading}
                isInitialLoading={isLoading}
            />
            <SidebarInset>
                <main className="flex-1 flex items-center justify-center p-8">
                    <div className="text-center space-y-4">
                        <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                            <FileText className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-2xl font-semibold">Welcome to Canvas Editor</h2>
                            <p className="text-muted-foreground">
                                Select a canvas from the sidebar to start editing, or create a new one to begin.
                            </p>
                        </div>
                        <Button onClick={handleCreateCanvas} disabled={isLoading}>
                            <Plus className="h-4 w-4 mr-2" />
                            {isLoading ? 'Creating...' : 'Create Your First Canvas'}
                        </Button>
                    </div>
                </main>
            </SidebarInset>
        </SidebarProvider>
    );
}

export default function CanvasPage() {
    return (
        <AuthGuard>
            <CanvasPageContent />
        </AuthGuard>
    );
} 