"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Canvas } from "@/types/canvas";
import { useCanvasApi } from "@/hooks/useCanvasApi";
import { CanvasSidebar } from "@/components/CanvasSidebar";
import { CanvasEditor } from "@/components/CanvasEditor";

export default function CanvasEditorPage() {
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

    // Load canvas data and canvases list
    useEffect(() => {
        const loadData = async () => {
            setIsInitialLoading(true);
            try {
                // Load all canvases for sidebar
                await getCanvases();

                // Load specific canvas
                const canvas = await getCanvas(canvasId);
                if (canvas) {
                    setCurrentCanvas(canvas);
                } else {
                    // Canvas not found, redirect to canvas list
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
            loadData();
        }
    }, [canvasId, getCanvases, getCanvas, router]);

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
    const handleDeleteCanvas = useCallback(async (canvasId: string) => {
        try {
            const success = await deleteCanvas(canvasId);
            if (success) {
                // If we're deleting the current canvas, redirect to canvas list
                if (canvasId === currentCanvas?.id) {
                    router.push('/canvas');
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
