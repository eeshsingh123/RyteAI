'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useAuthContext } from '@/components/AuthProvider';
import {
    Canvas,
    CanvasCreateRequest,
    CanvasUpdateRequest,
    API_BASE_URL,
} from '@/types/canvas';

export type ImproveAction = 'improve' | 'rephrase' | 'summarize' | 'expand' | 'simplify' | 'formal' | 'casual';

export const useCanvasApi = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [canvases, setCanvases] = useState<Canvas[]>([]);
    const { getAccessToken, updateCredits } = useAuthContext();

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

    // Helper to get auth headers
    const getAuthHeaders = useCallback(async (): Promise<HeadersInit> => {
        const token = await getAccessToken();
        if (!token) {
            throw new Error('Not authenticated');
        }
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        };
    }, [getAccessToken]);

    // Helper to handle 401/402 errors
    const handleAuthError = useCallback((response: Response) => {
        if (response.status === 401) {
            toast.error('Session expired. Please sign in again.');
            return true;
        }
        if (response.status === 402) {
            toast.error('Insufficient credits. Please add more credits to continue.');
            return true;
        }
        return false;
    }, []);

    const getCanvases = useCallback(async (favoritesOnly: boolean = false): Promise<Canvas[]> => {
        setIsLoading(true);
        try {
            const headers = await getAuthHeaders();
            const params = new URLSearchParams({
                favorites_only: favoritesOnly.toString()
            });

            const response = await fetch(`${API_BASE_URL}/canvas/?${params}`, { headers });

            if (handleAuthError(response)) return [];

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
    }, [getAuthHeaders, handleApiError, handleAuthError, transformCanvas]);

    const getCanvas = useCallback(async (canvasId: string): Promise<Canvas | null> => {
        setIsLoading(true);
        try {
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_BASE_URL}/canvas/${canvasId}`, { headers });

            if (handleAuthError(response)) return null;

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
    }, [getAuthHeaders, handleApiError, handleAuthError, transformCanvas]);

    const createCanvas = useCallback(async (canvasData: Omit<CanvasCreateRequest, 'user_id'>): Promise<Canvas | null> => {
        setIsLoading(true);
        try {
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_BASE_URL}/canvas/`, {
                method: 'POST',
                headers,
                body: JSON.stringify(canvasData)
            });

            if (handleAuthError(response)) return null;

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
    }, [getAuthHeaders, handleApiError, handleAuthError, transformCanvas]);

    const updateCanvas = useCallback(async (canvasId: string, updates: CanvasUpdateRequest): Promise<Canvas | null> => {
        setIsLoading(true);
        try {
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_BASE_URL}/canvas/${canvasId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(updates)
            });

            if (handleAuthError(response)) return null;

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
    }, [getAuthHeaders, handleApiError, handleAuthError, transformCanvas]);

    const toggleFavorite = useCallback(async (canvasId: string, isFavorite: boolean): Promise<Canvas | null> => {
        try {
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_BASE_URL}/canvas/${canvasId}/favorite`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ is_favorite: isFavorite })
            });

            if (handleAuthError(response)) return null;

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
    }, [getAuthHeaders, handleApiError, handleAuthError, transformCanvas]);

    const renameCanvas = useCallback(async (canvasId: string, name: string): Promise<Canvas | null> => {
        try {
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_BASE_URL}/canvas/${canvasId}/rename`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ name })
            });

            if (handleAuthError(response)) return null;

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
    }, [getAuthHeaders, handleApiError, handleAuthError, transformCanvas]);

    const deleteCanvas = useCallback(async (canvasId: string): Promise<boolean> => {
        setIsLoading(true);
        try {
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_BASE_URL}/canvas/${canvasId}`, {
                method: 'DELETE',
                headers,
            });

            if (handleAuthError(response)) return false;

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
    }, [getAuthHeaders, handleApiError, handleAuthError]);

    const executeInstruction = useCallback(async (canvasId: string, instruction: string): Promise<string | null> => {
        try {
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_BASE_URL}/ai/execute-instruction`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    canvas_id: canvasId,
                    instruction: instruction
                })
            });

            if (handleAuthError(response)) return null;

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

            // Update credits if returned
            if (data.credits_remaining !== null && data.credits_remaining !== undefined) {
                updateCredits(data.credits_remaining);
            }

            if (!data.success) {
                throw new Error(data.error || 'Failed to process instruction');
            }

            return data.response;
        } catch (error) {
            handleApiError(error, 'Failed to execute AI instruction');
            return null;
        }
    }, [getAuthHeaders, handleApiError, handleAuthError, updateCredits]);

    const improveText = useCallback(async (
        canvasId: string, 
        selectedText: string, 
        action: ImproveAction
    ): Promise<string | null> => {
        try {
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_BASE_URL}/ai/improve-text`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    canvas_id: canvasId,
                    selected_text: selectedText,
                    action: action
                })
            });

            if (handleAuthError(response)) return null;

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Canvas not found');
                }
                if (response.status === 403) {
                    throw new Error('Access denied to this canvas');
                }
                throw new Error(`Failed to improve text: ${response.status}`);
            }

            const data = await response.json();

            // Update credits if returned
            if (data.credits_remaining !== null && data.credits_remaining !== undefined) {
                updateCredits(data.credits_remaining);
            }

            if (!data.success) {
                throw new Error(data.error || 'Failed to improve text');
            }

            return data.improved_text;
        } catch (error) {
            handleApiError(error, 'Failed to improve text');
            return null;
        }
    }, [getAuthHeaders, handleApiError, handleAuthError, updateCredits]);

    const getCredits = useCallback(async (): Promise<number | null> => {
        try {
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_BASE_URL}/ai/credits`, { headers });

            if (handleAuthError(response)) return null;

            if (!response.ok) {
                throw new Error(`Failed to fetch credits: ${response.status}`);
            }

            const data = await response.json();
            return data.credits;
        } catch (error) {
            handleApiError(error, 'Failed to fetch credits');
            return null;
        }
    }, [getAuthHeaders, handleApiError, handleAuthError]);

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
        executeInstruction,
        improveText,
        getCredits
    };
};
