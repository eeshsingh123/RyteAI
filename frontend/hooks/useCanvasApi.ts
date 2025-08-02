import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
    Canvas,
    CanvasCreateRequest,
    CanvasUpdateRequest,
    API_BASE_URL,
    USER_ID
} from '@/types/canvas';

export const useCanvasApi = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [canvases, setCanvases] = useState<Canvas[]>([]);

    const handleApiError = useCallback((error: unknown, defaultMessage: string) => {
        console.error(error);
        const errorMessage = error instanceof Error ? error.message : defaultMessage;
        toast.error(errorMessage);
    }, []);

    const transformCanvas = useCallback((canvas: Omit<Canvas, 'created_at' | 'updated_at'> & { created_at: string; updated_at: string }): Canvas => {
        return {
            ...canvas,
            created_at: new Date(canvas.created_at),
            updated_at: new Date(canvas.updated_at)
        };
    }, []);

    const getCanvases = useCallback(async (favoritesOnly: boolean = false): Promise<Canvas[]> => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({
                user_id: USER_ID,
                favorites_only: favoritesOnly.toString()
            });

            const response = await fetch(`${API_BASE_URL}/canvas/?${params}`);

            if (!response.ok) {
                throw new Error(`Failed to fetch canvases: ${response.status}`);
            }

            const data = await response.json();
            const canvasesWithDates = data.map(transformCanvas);
            setCanvases(canvasesWithDates);
            return canvasesWithDates;
        } catch (error) {
            handleApiError(error, 'Failed to load canvases');
            return [];
        } finally {
            setIsLoading(false);
        }
    }, [handleApiError, transformCanvas]);

    const getCanvas = useCallback(async (canvasId: string): Promise<Canvas | null> => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/canvas/${canvasId}`);

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Canvas not found');
                }
                throw new Error(`Failed to fetch canvas: ${response.status}`);
            }

            const data = await response.json();
            return transformCanvas(data);
        } catch (error) {
            handleApiError(error, 'Failed to load canvas');
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [handleApiError, transformCanvas]);

    const createCanvas = useCallback(async (canvasData: Omit<CanvasCreateRequest, 'user_id'>): Promise<Canvas | null> => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/canvas/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...canvasData,
                    user_id: USER_ID
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to create canvas: ${response.status}`);
            }

            const data = await response.json();
            const newCanvas = transformCanvas(data);
            setCanvases(prev => [newCanvas, ...prev]);
            toast.success('Canvas created successfully');
            return newCanvas;
        } catch (error) {
            handleApiError(error, 'Failed to create canvas');
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [handleApiError, transformCanvas]);

    const updateCanvas = useCallback(async (canvasId: string, updates: CanvasUpdateRequest): Promise<Canvas | null> => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/canvas/${canvasId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updates)
            });

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Canvas not found');
                }
                throw new Error(`Failed to update canvas: ${response.status}`);
            }

            const data = await response.json();
            const updatedCanvas = transformCanvas(data);
            setCanvases(prev => prev.map(c => c.id === canvasId ? updatedCanvas : c));
            return updatedCanvas;
        } catch (error) {
            handleApiError(error, 'Failed to update canvas');
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [handleApiError, transformCanvas]);

    const toggleFavorite = useCallback(async (canvasId: string, isFavorite: boolean): Promise<Canvas | null> => {
        try {
            const response = await fetch(`${API_BASE_URL}/canvas/${canvasId}/favorite`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ is_favorite: isFavorite })
            });

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Canvas not found');
                }
                throw new Error(`Failed to toggle favorite: ${response.status}`);
            }

            const data = await response.json();
            const updatedCanvas = transformCanvas(data);
            setCanvases(prev => prev.map(c => c.id === canvasId ? updatedCanvas : c));
            toast.success(isFavorite ? 'Added to favorites' : 'Removed from favorites');
            return updatedCanvas;
        } catch (error) {
            handleApiError(error, 'Failed to toggle favorite');
            return null;
        }
    }, [handleApiError, transformCanvas]);

    const renameCanvas = useCallback(async (canvasId: string, name: string): Promise<Canvas | null> => {
        try {
            const response = await fetch(`${API_BASE_URL}/canvas/${canvasId}/rename`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name })
            });

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Canvas not found');
                }
                throw new Error(`Failed to rename canvas: ${response.status}`);
            }

            const data = await response.json();
            const updatedCanvas = transformCanvas(data);
            setCanvases(prev => prev.map(c => c.id === canvasId ? updatedCanvas : c));
            toast.success('Canvas renamed successfully');
            return updatedCanvas;
        } catch (error) {
            handleApiError(error, 'Failed to rename canvas');
            return null;
        }
    }, [handleApiError, transformCanvas]);

    const deleteCanvas = useCallback(async (canvasId: string): Promise<boolean> => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/canvas/${canvasId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Canvas not found');
                }
                throw new Error(`Failed to delete canvas: ${response.status}`);
            }

            setCanvases(prev => prev.filter(c => c.id !== canvasId));
            toast.success('Canvas deleted successfully');
            return true;
        } catch (error) {
            handleApiError(error, 'Failed to delete canvas');
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [handleApiError]);

    const executeInstruction = useCallback(async (canvasId: string, instruction: string): Promise<string | null> => {
        try {
            const response = await fetch(`${API_BASE_URL}/ai/execute-instruction`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    canvas_id: canvasId,
                    user_id: USER_ID,
                    instruction: instruction
                })
            });

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Canvas not found');
                }
                if (response.status === 403) {
                    throw new Error('Access denied to this canvas');
                }
                throw new Error(`Failed to execute instruction: ${response.status}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to process instruction');
            }

            return data.response;
        } catch (error) {
            handleApiError(error, 'Failed to execute AI instruction');
            return null;
        }
    }, [handleApiError]);

    return {
        isLoading,
        canvases,
        setCanvases,
        getCanvases,
        getCanvas,
        createCanvas,
        updateCanvas,
        toggleFavorite,
        renameCanvas,
        deleteCanvas,
        executeInstruction
    };
}; 