export interface Canvas {
    id: string;
    name: string;
    description?: string;
    content: Record<string, unknown>;
    is_favorite: boolean;
    tags: string[];
    user_id: string;
    created_at: Date;
    updated_at: Date;
}

export interface CanvasCreateRequest {
    name: string;
    description?: string;
    content: Record<string, unknown>;
    user_id: string;
    is_favorite?: boolean;
    tags?: string[];
}

export interface CanvasUpdateRequest {
    name?: string;
    description?: string;
    content?: Record<string, unknown>;
    is_favorite?: boolean;
    tags?: string[];
}

export interface CanvasFavoriteRequest {
    is_favorite: boolean;
}

export interface CanvasRenameRequest {
    name: string;
}

export interface ApiError {
    message: string;
    status: number;
}

export interface CanvasApiResponse {
    success: boolean;
    data?: Canvas;
    error?: ApiError;
}

export interface CanvasListApiResponse {
    success: boolean;
    data?: Canvas[];
    error?: ApiError;
}

export interface DeleteCanvasResponse {
    success: boolean;
    message?: string;
    error?: ApiError;
}

export const API_BASE_URL = 'http://localhost:8000/api/v1';

// TODO: Replace with actual user ID from authentication
export const USER_ID = 'user123'; 