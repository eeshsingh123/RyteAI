import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent, JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    SidebarInset,
} from "@/components/ui/sidebar";
import {
    Save,
    ArrowLeft,
    Bold,
    Italic,
    List,
    ListOrdered,
    FileText,
    Hash,
    Quote,
    Code,
    CheckCircle
} from "lucide-react";
import { Canvas } from "@/types/canvas";
import { useCanvasApi } from "@/hooks/useCanvasApi";

interface CanvasEditorProps {
    canvasId: string;
    currentCanvas: Canvas | null;
    onCanvasUpdate: (canvas: Canvas) => void;
}

export const CanvasEditor = ({ canvasId, currentCanvas, onCanvasUpdate }: CanvasEditorProps) => {
    const router = useRouter();
    const { updateCanvas } = useCanvasApi();
    const [canvasName, setCanvasName] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isAutoSaving, setIsAutoSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);

    // Initialize editor with proper StarterKit configuration
    const editor = useEditor({
        extensions: [
            StarterKit,
            Placeholder.configure({
                placeholder: 'Let your imagination run wild...',
            }),
        ],
        content: '',
        editorProps: {
            attributes: {
                class: 'canvas-editor-content max-w-none min-h-[calc(100vh-200px)] focus:outline-none px-8 py-6',
            },
        },
        onUpdate: () => {
            handleAutoSave();
        },
    });

    // Separate refs for different types of saves
    const contentDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const titleDebounceRef = useRef<NodeJS.Timeout | null>(null);

    // Extract common save logic
    const saveCanvas = useCallback(async (name: string, content: JSONContent) => {
        if (!currentCanvas) return;

        setIsAutoSaving(true);
        try {
            const updatedCanvas = await updateCanvas(canvasId, {
                name,
                content
            });

            if (updatedCanvas) {
                onCanvasUpdate(updatedCanvas);
                setLastSaved(new Date());
            }
        } catch (error) {
            console.error('Error auto-saving canvas:', error);
        } finally {
            setIsAutoSaving(false);
        }
    }, [currentCanvas, canvasId, updateCanvas, onCanvasUpdate]);

    // Debounced auto-save function for content
    const handleAutoSave = useCallback(() => {
        if (contentDebounceRef.current) {
            clearTimeout(contentDebounceRef.current);
        }

        contentDebounceRef.current = setTimeout(() => {
            if (!editor) return;
            saveCanvas(canvasName, editor.getJSON());
        }, 5000);
    }, [canvasName, editor, saveCanvas]);

    // Handle title change with separate debouncing
    const handleTitleChange = useCallback((value: string) => {
        setCanvasName(value);

        if (titleDebounceRef.current) {
            clearTimeout(titleDebounceRef.current);
        }

        titleDebounceRef.current = setTimeout(() => {
            if (!editor) return;
            saveCanvas(value, editor.getJSON());
        }, 2000);
    }, [editor, saveCanvas]);

    // Update editor content when canvas changes
    useEffect(() => {
        if (currentCanvas && editor) {
            setCanvasName(currentCanvas.name);
            const content = currentCanvas.content || { type: 'doc', content: [{ type: 'paragraph' }] };

            // Only update content if it's different from current content
            const currentContent = editor.getJSON();
            if (JSON.stringify(currentContent) !== JSON.stringify(content)) {
                editor.commands.setContent(content);
            }

            setLastSaved(currentCanvas.updated_at ? new Date(currentCanvas.updated_at) : null);
        }
    }, [currentCanvas, editor]);

    // Manual save function
    const handleSaveCanvas = useCallback(async () => {
        if (!currentCanvas || !editor) return;

        setIsSaving(true);
        try {
            const content = editor.getJSON();
            const updatedCanvas = await updateCanvas(canvasId, {
                name: canvasName,
                content: content
            });

            if (updatedCanvas) {
                onCanvasUpdate(updatedCanvas);
                setLastSaved(new Date());
            }
        } catch (error) {
            console.error('Error saving canvas:', error);
        } finally {
            setIsSaving(false);
        }
    }, [currentCanvas, editor, canvasId, canvasName, updateCanvas, onCanvasUpdate]);

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                handleSaveCanvas();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleSaveCanvas]);

    // Cleanup both debounces on unmount
    useEffect(() => {
        return () => {
            if (contentDebounceRef.current) {
                clearTimeout(contentDebounceRef.current);
            }
            if (titleDebounceRef.current) {
                clearTimeout(titleDebounceRef.current);
            }
        };
    }, []);

    if (!currentCanvas) {
        return (
            <SidebarInset className="flex-1 flex flex-col">
                <div className="min-h-screen flex items-center justify-center">
                    <div className="text-center space-y-4">
                        <FileText className="h-16 w-16 mx-auto text-muted-foreground" />
                        <h2 className="text-2xl font-semibold">Canvas not found</h2>
                        <p className="text-muted-foreground">The canvas you&apos;re looking for doesn&apos;t exist.</p>
                        <Button onClick={() => router.push('/canvas')}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Canvases
                        </Button>
                    </div>
                </div>
            </SidebarInset>
        );
    }

    return (
        <SidebarInset className="flex flex-col">
            <header className="flex h-16 shrink-0 items-center px-4 border-b relative">
                {/* Centered title */}
                <div className="flex-1 flex justify-center">
                    <Input
                        value={canvasName}
                        onChange={(e) => handleTitleChange(e.target.value)}
                        className="text-center text-lg font-semibold border-none shadow-none focus-visible:ring-1 focus-visible:ring-ring max-w-md"
                        placeholder="Untitled Canvas"
                    />
                </div>

                {/* Save status and button - right side */}
                <div className="absolute right-4 flex items-center gap-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {isAutoSaving && (
                            <div className="flex items-center gap-1">
                                <div className="animate-spin rounded-full h-3 w-3 border-b border-primary"></div>
                                <span>Saving...</span>
                            </div>
                        )}
                        {lastSaved && !isAutoSaving && (
                            <div className="flex items-center gap-1">
                                <CheckCircle className="h-3 w-3 text-green-500" />
                                <span>Saved</span>
                            </div>
                        )}
                    </div>
                    <Button
                        onClick={handleSaveCanvas}
                        disabled={isSaving}
                        size="sm"
                        variant="outline"
                    >
                        <Save className="h-4 w-4 mr-2" />
                        {isSaving ? 'Saving...' : 'Save'}
                    </Button>
                </div>
            </header>

            {/* Editor Toolbar */}
            {editor && (
                <div className="flex items-center gap-1 p-3 border-b">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        className={editor.isActive('bold') ? 'bg-accent' : ''}
                        disabled={!editor.can().chain().focus().toggleBold().run()}
                    >
                        <Bold className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        className={editor.isActive('italic') ? 'bg-accent' : ''}
                        disabled={!editor.can().chain().focus().toggleItalic().run()}
                    >
                        <Italic className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                        className={editor.isActive('heading', { level: 1 }) ? 'bg-accent' : ''}
                        disabled={!editor.can().chain().focus().toggleHeading({ level: 1 }).run()}
                    >
                        <Hash className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        className={editor.isActive('bulletList') ? 'bg-accent' : ''}
                        disabled={!editor.can().chain().focus().toggleBulletList().run()}
                    >
                        <List className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        className={editor.isActive('orderedList') ? 'bg-accent' : ''}
                        disabled={!editor.can().chain().focus().toggleOrderedList().run()}
                    >
                        <ListOrdered className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleBlockquote().run()}
                        className={editor.isActive('blockquote') ? 'bg-accent' : ''}
                        disabled={!editor.can().chain().focus().toggleBlockquote().run()}
                    >
                        <Quote className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleCode().run()}
                        className={editor.isActive('code') ? 'bg-accent' : ''}
                        disabled={!editor.can().chain().focus().toggleCode().run()}
                    >
                        <Code className="h-4 w-4" />
                    </Button>
                    <div className="text-xs text-muted-foreground ml-auto">
                        Auto-save enabled • Ctrl+S to save manually
                    </div>
                </div>
            )}

            <main className="flex-1 overflow-auto">
                <div className="w-full h-full">
                    <EditorContent
                        editor={editor}
                    />
                </div>
            </main>
        </SidebarInset>
    );
}; 