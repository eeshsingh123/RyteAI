"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Canvas } from "@/types/canvas";
import { useCanvasApi } from "@/hooks/useCanvasApi";
import { CanvasSidebar } from "@/components/CanvasSidebar";
import { CanvasEditor } from "@/components/CanvasEditor";
import { AgentChat } from "@/components/AgentChat";
import { AuthGuard } from "@/components/AuthGuard";
import { toast } from "sonner";

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
    const [showAgentChat, setShowAgentChat] = useState(true);

    // Refs to track initialization and prevent duplicate fetches
    const hasFetchedCanvases = useRef(false);
    const hasFetchedCurrentCanvas = useRef<string | null>(null);
    const isFetchingCanvas = useRef(false);

    // Load canvases list once on mount (for sidebar)
    useEffect(() => {
        if (hasFetchedCanvases.current) return;
        hasFetchedCanvases.current = true;
        getCanvases();

        // Reset the ref on unmount to handle StrictMode double-mounting
        return () => {
            hasFetchedCanvases.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Load specific canvas ONLY on initial mount or when canvasId actually changes
    useEffect(() => {
        const loadCanvas = async () => {
            // Prevent duplicate fetches
            if (isFetchingCanvas.current) return;

            // Don't reload if we've already fetched this specific canvas
            if (hasFetchedCurrentCanvas.current === canvasId && currentCanvas?.id === canvasId) {
                setIsInitialLoading(false);
                return;
            }

            isFetchingCanvas.current = true;

            try {
                // First check if we have this canvas in our local list
                let canvas: Canvas | null = canvases.find(c => c.id === canvasId) || null;

                if (!canvas) {
                    // If not in local list, fetch from API
                    canvas = await getCanvas(canvasId);
                }

                if (canvas) {
                    setCurrentCanvas(canvas);
                    hasFetchedCurrentCanvas.current = canvasId;
                } else {
                    router.push('/canvas');
                }
            } catch (error) {
                console.error('Error loading canvas:', error);
                router.push('/canvas');
            } finally {
                setIsInitialLoading(false);
                isFetchingCanvas.current = false;
            }
        };

        if (canvasId) {
            loadCanvas();
        }
        // Only depend on canvasId - other deps would cause infinite loops
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canvasId]);

    // Reset fetch tracking when navigating to different canvas
    useEffect(() => {
        if (currentCanvas && currentCanvas.id !== canvasId) {
            hasFetchedCurrentCanvas.current = null;
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

    // Handle canvas modified by agent - reload from server
    const handleCanvasModified = useCallback(async () => {
        try {
            const updatedCanvas = await getCanvas(canvasId);
            if (updatedCanvas) {
                setCurrentCanvas(updatedCanvas);
                setCanvases(prev => prev.map(c => c.id === updatedCanvas.id ? updatedCanvas : c));
                toast.success('Canvas updated by agent');
            }
        } catch (error) {
            console.error('Error reloading canvas:', error);
        }
    }, [canvasId, getCanvas, setCanvases]);

    // Toggle agent chat visibility
    const toggleAgentChat = useCallback(() => {
        setShowAgentChat(prev => !prev);
    }, []);

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
        } as React.CSSProperties} className="h-screen overflow-hidden">
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
            <AgentChat
                canvasId={canvasId}
                onCanvasModified={handleCanvasModified}
                isOpen={showAgentChat}
                onToggle={toggleAgentChat}
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
