"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Canvas } from "@/types/canvas";
import { useCanvasApi } from "@/hooks/useCanvasApi";
import { CanvasSidebar } from "@/components/CanvasSidebar";
import { CanvasEditor } from "@/components/CanvasEditor";
import { AuthGuard } from "@/components/AuthGuard";

function CanvasEditorPageContent() {
    const router = useRouter();
    const params = useParams();
    const canvasId = params.id as string;

    const {
        isLoading,
        canvases,
        setCanvases,
        getCanvases,
        getCanvas,
        createCanvas,
        deleteCanvas,
        toggleFavorite,
    } = useCanvasApi();

    const [currentCanvas, setCurrentCanvas] = useState<Canvas | null>(null);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [isInitialized, setIsInitialized] = useState(false);

    // Load canvases list once on mount (for sidebar)
    useEffect(() => {
        getCanvases();
    }, [getCanvases]);

    // Load specific canvas ONLY on initial mount or when canvasId actually changes
    useEffect(() => {
        const loadCanvas = async () => {
            // Don't reload if we're already initialized and have the right canvas
            if (isInitialized && currentCanvas?.id === canvasId) {
                return;
            }

            try {
                // First check if we have this canvas in our local list
                let canvas: Canvas | null = canvases.find(c => c.id === canvasId) || null;

                if (!canvas) {
                    // If not in local list, fetch from API
                    canvas = await getCanvas(canvasId);
                }

                if (canvas) {
                    setCurrentCanvas(canvas);
                    setIsInitialized(true);
                } else {
                    router.push('/canvas');
                }
            } catch (error) {
                console.error('Error loading canvas:', error);
                router.push('/canvas');
            } finally {
                setIsInitialLoading(false);
            }
        };

        if (canvasId) {
            loadCanvas();
        }
    }, [canvasId, canvases, getCanvas, router, currentCanvas?.id, isInitialized]); // Include necessary dependencies

    // Reset initialization when navigating to different canvas
    useEffect(() => {
        if (currentCanvas && currentCanvas.id !== canvasId) {
            setIsInitialized(false);
        }
    }, [canvasId, currentCanvas]);

    // Create new canvas
    const handleCreateCanvas = useCallback(async () => {
        const newCanvas = await createCanvas({
            name: 'Untitled Canvas',
            description: '',
            content: {}
        });

        if (newCanvas) {
            router.push(`/canvas/${newCanvas.id}`);
        }
    }, [createCanvas, router]);

    // Handle delete canvas
    const handleDeleteCanvas = useCallback(async (canvasIdToDelete: string) => {
        try {
            const success = await deleteCanvas(canvasIdToDelete);
            if (success) {
                // Only redirect if we're deleting the current canvas
                if (currentCanvas?.id === canvasIdToDelete) {
                    router.push('/canvas');
                } else {
                    // If deleting a different canvas, just stay on the current page
                    // The sidebar will automatically update since canvases state is managed by useCanvasApi
                }
            }
        } catch (error) {
            console.error('Error deleting canvas:', error);
            // Error handling is already done in the useCanvasApi hook
        }
    }, [deleteCanvas, currentCanvas?.id, router]);

    // Toggle favorite status
    const handleToggleFavorite = useCallback(async (canvasId: string, isFavorite: boolean) => {
        const updatedCanvas = await toggleFavorite(canvasId, isFavorite);

        // Update current canvas if it's the one being toggled
        if (currentCanvas && currentCanvas.id === canvasId && updatedCanvas) {
            setCurrentCanvas(updatedCanvas);
        }
    }, [toggleFavorite, currentCanvas]);

    // Handle canvas update from editor
    const handleCanvasUpdate = useCallback((updatedCanvas: Canvas) => {
        setCurrentCanvas(updatedCanvas);
        setCanvases(prev => prev.map(c => c.id === updatedCanvas.id ? updatedCanvas : c));
    }, [setCanvases]);

    if (isInitialLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    <p className="text-sm text-muted-foreground">Loading canvas...</p>
                </div>
            </div>
        );
    }

    return (
        <SidebarProvider defaultOpen={true} style={{
            "--sidebar-width": "20rem",
            "--sidebar-width-mobile": "20rem",
        } as React.CSSProperties}>
            <CanvasSidebar
                canvases={canvases}
                onCreateCanvas={handleCreateCanvas}
                onToggleFavorite={handleToggleFavorite}
                onDelete={handleDeleteCanvas}
                isLoading={isLoading}
                isInitialLoading={isInitialLoading}
                currentCanvasId={canvasId}
            />
            <CanvasEditor
                canvasId={canvasId}
                currentCanvas={currentCanvas}
                onCanvasUpdate={handleCanvasUpdate}
            />
        </SidebarProvider>
    );
}

export default function CanvasEditorPage() {
    return (
        <AuthGuard>
            <CanvasEditorPageContent />
        </AuthGuard>
    );
}
