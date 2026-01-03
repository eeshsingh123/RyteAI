import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent, JSONContent, Editor, BubbleMenu } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { toast } from "sonner";
import { AIResponse } from "./AgentMarks";
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
    CheckCircle,
    Bot,
    Sparkles,
    RefreshCw,
    AlignLeft,
    Expand,
    Minimize2,
    Briefcase,
    MessageCircle,
    Loader2
} from "lucide-react";
import { Canvas } from "@/types/canvas";
import { useCanvasApi, ImproveAction } from "@/hooks/useCanvasApi";

// Rate limiting constants
const MIN_LLM_CALL_INTERVAL = 2000; // Minimum 2 seconds between LLM calls

interface CanvasEditorProps {
    canvasId: string;
    currentCanvas: Canvas | null;
    onCanvasUpdate: (canvas: Canvas) => void;
}

export const CanvasEditor = ({ canvasId, currentCanvas, onCanvasUpdate }: CanvasEditorProps) => {
    const router = useRouter();
    const { updateCanvas, executeInstruction, improveText } = useCanvasApi();
    const [canvasName, setCanvasName] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isAutoSaving, setIsAutoSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [isProcessingInstruction, setIsProcessingInstruction] = useState(false);
    const [isImproving, setIsImproving] = useState(false);

    // Rate limiting for LLM calls
    const lastLLMCallRef = useRef<number>(0);

    // Handle text improvement from bubble menu with rate limiting
    const handleImproveText = useCallback(async (editor: Editor, action: ImproveAction) => {
        if (!currentCanvas || isImproving) return;

        // Rate limiting check
        const now = Date.now();
        const timeSinceLastCall = now - lastLLMCallRef.current;
        if (timeSinceLastCall < MIN_LLM_CALL_INTERVAL) {
            toast.error(`Please wait ${Math.ceil((MIN_LLM_CALL_INTERVAL - timeSinceLastCall) / 1000)} second(s) before making another request`);
            return;
        }

        const { from, to } = editor.state.selection;
        const selectedText = editor.state.doc.textBetween(from, to);

        if (!selectedText.trim()) {
            toast.error('Please select some text first');
            return;
        }

        lastLLMCallRef.current = now;
        setIsImproving(true);
        toast.loading('Improving text...', { id: 'improve-text' });

        try {
            const improvedText = await improveText(canvasId, selectedText, action);

            if (improvedText) {
                // Replace selected text with improved version
                editor.chain()
                    .setTextSelection({ from, to })
                    .insertContent(improvedText)
                    .run();

                // Highlight the improved text
                const newTo = from + improvedText.length;
                setTimeout(() => {
                    if (editor && !editor.isDestroyed) {
                        editor.chain()
                            .setTextSelection({ from, to: newTo })
                            .setMark('aiResponse')
                            .run();

                        // Clear selection
                        setTimeout(() => {
                            if (editor && !editor.isDestroyed) {
                                editor.chain().setTextSelection(newTo).run();
                            }
                        }, 50);

                        // Remove highlight after 7 seconds
                        setTimeout(() => {
                            if (editor && !editor.isDestroyed) {
                                editor.chain()
                                    .setTextSelection({ from, to: newTo })
                                    .unsetMark('aiResponse')
                                    .run();
                                setTimeout(() => {
                                    if (editor && !editor.isDestroyed) {
                                        editor.chain().setTextSelection(newTo).run();
                                    }
                                }, 50);
                            }
                        }, 7000);
                    }
                }, 100);

                toast.success('Text improved!', { id: 'improve-text' });
            } else {
                toast.error('Failed to improve text', { id: 'improve-text' });
            }
        } catch (error) {
            console.error('Error improving text:', error);
            toast.error('Failed to improve text', { id: 'improve-text' });
        } finally {
            setIsImproving(false);
        }
    }, [currentCanvas, canvasId, improveText, isImproving]);

    // Handle @agent instruction execution with rate limiting
    const handleAgentInstruction = useCallback(async (editor: Editor, instruction: string, lineStart: number, lineEnd: number) => {
        if (!currentCanvas || isProcessingInstruction) return;

        // Rate limiting check
        const now = Date.now();
        const timeSinceLastCall = now - lastLLMCallRef.current;
        if (timeSinceLastCall < MIN_LLM_CALL_INTERVAL) {
            toast.error(`Please wait ${Math.ceil((MIN_LLM_CALL_INTERVAL - timeSinceLastCall) / 1000)} second(s) before making another request`);
            return;
        }

        lastLLMCallRef.current = now;
        setIsProcessingInstruction(true);

        try {
            toast.loading('Processing your instruction...', {
                id: 'agent-processing'
            });

            const response = await executeInstruction(canvasId, instruction);

            if (response) {
                editor.chain()
                    .setTextSelection({ from: lineStart, to: lineEnd })
                    .insertContent(response)
                    .run();

                const responseLength = response.length;
                setTimeout(() => {
                    if (editor && !editor.isDestroyed) {
                        editor.chain()
                            .setTextSelection({ from: lineStart, to: lineStart + responseLength })
                            .setMark('aiResponse')
                            .run();

                        setTimeout(() => {
                            if (editor && !editor.isDestroyed) {
                                const currentPos = editor.state.selection.to;
                                editor.chain().setTextSelection(currentPos).run();
                            }
                        }, 50);

                        setTimeout(() => {
                            if (editor && !editor.isDestroyed) {
                                editor.chain()
                                    .setTextSelection({ from: lineStart, to: lineStart + responseLength })
                                    .unsetMark('aiResponse')
                                    .run();
                                setTimeout(() => {
                                    if (editor && !editor.isDestroyed) {
                                        const currentPos = editor.state.selection.to;
                                        editor.chain().setTextSelection(currentPos).run();
                                    }
                                }, 50);
                            }
                        }, 7000);
                    }
                }, 100);

                toast.success('Instruction processed successfully!', {
                    id: 'agent-processing'
                });
            } else {
                toast.error('Failed to process instruction', {
                    id: 'agent-processing'
                });
            }
        } catch (error) {
            console.error('Error processing agent instruction:', error);
            toast.error('Failed to process instruction', {
                id: 'agent-processing'
            });
        } finally {
            setIsProcessingInstruction(false);
        }
    }, [currentCanvas, canvasId, executeInstruction, isProcessingInstruction]);

    // Create plugin for @agent highlighting using decorations
    const agentHighlightPlugin = new Plugin({
        key: new PluginKey('agentHighlight'),

        state: {
            init() {
                return DecorationSet.empty;
            },

            apply(tr) {
                const decorations: Decoration[] = [];

                tr.doc.descendants((node, pos) => {
                    if (node.isText && node.text) {
                        const text = node.text;
                        const agentPattern = /@agent\s+[^\n\r]+/g;
                        let match;

                        while ((match = agentPattern.exec(text)) !== null) {
                            const from = pos + match.index;
                            const to = pos + match.index + match[0].length;

                            const decoration = Decoration.inline(from, to, {
                                class: 'agent-instruction-highlight',
                                'data-tooltip': 'Press Enter to send this instruction to AI',
                                style: 'background-color: rgba(59, 130, 246, 0.15); color: rgb(59, 130, 246); padding: 2px 4px; border-radius: 4px; font-weight: 500; cursor: pointer; position: relative;'
                            });

                            decorations.push(decoration);
                        }
                    }
                });

                return DecorationSet.create(tr.doc, decorations);
            }
        },

        props: {
            decorations(state) {
                return this.getState(state);
            }
        }
    });

    // Create custom extension for @agent handling
    const AgentExtension = Extension.create({
        name: 'agentHandler',

        addProseMirrorPlugins() {
            return [agentHighlightPlugin];
        },

        addKeyboardShortcuts() {
            return {
                'Enter': () => {
                    if (isProcessingInstruction) return false;

                    const { editor } = this;
                    const { $from } = editor.state.selection;

                    const lineStart = $from.start($from.depth);
                    const lineEnd = $from.end($from.depth);
                    const lineText = editor.state.doc.textBetween(lineStart, lineEnd);

                    const agentPattern = /^@agent\s+(.+)$/;
                    const match = lineText.match(agentPattern);

                    if (match && match[1].trim()) {
                        const instruction = match[1].trim();

                        setTimeout(() => {
                            handleAgentInstruction(editor, instruction, lineStart, lineEnd);
                        }, 10);

                        return true;
                    }

                    return false;
                }
            }
        }
    });

    // Initialize editor
    const editor = useEditor({
        extensions: [
            StarterKit,
            Placeholder.configure({
                placeholder: 'Start typing... (use @agent for AI commands)',
            }),
            AIResponse,
            AgentExtension,
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

    // Handle manual save keyboard shortcut (Ctrl+S)
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

    // Cleanup debounces on unmount
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
                    <div className="text-xs text-muted-foreground ml-auto flex items-center gap-4">
                        {isProcessingInstruction && (
                            <div className="flex items-center gap-1">
                                <Bot className="h-3 w-3 animate-pulse text-blue-500" />
                                <span>Processing AI instruction...</span>
                            </div>
                        )}
                        <span>Type @agent followed by your instruction</span>
                    </div>
                </div>
            )}

            {/* AI Bubble Menu for text selection */}
            {editor && (
                <BubbleMenu
                    editor={editor}
                    tippyOptions={{
                        duration: 100,
                        placement: 'top',
                        maxWidth: 'none',
                        appendTo: () => document.body,
                    }}
                    className="bubble-menu"
                >
                    <div className="flex flex-wrap items-center gap-0.5 bg-popover border border-border rounded-lg shadow-lg p-1.5 max-w-[95vw]">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleImproveText(editor, 'improve')}
                            disabled={isImproving}
                            className="h-7 px-2 text-xs gap-1 shrink-0"
                            title="Improve writing"
                        >
                            {isImproving ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Sparkles className="h-3.5 w-3.5" />
                            )}
                            <span>Improve</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleImproveText(editor, 'rephrase')}
                            disabled={isImproving}
                            className="h-7 px-2 text-xs gap-1 shrink-0"
                            title="Rephrase text"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                            <span>Rephrase</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleImproveText(editor, 'summarize')}
                            disabled={isImproving}
                            className="h-7 px-2 text-xs gap-1 shrink-0"
                            title="Summarize text"
                        >
                            <AlignLeft className="h-3.5 w-3.5" />
                            <span>Summarize</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleImproveText(editor, 'expand')}
                            disabled={isImproving}
                            className="h-7 px-2 text-xs gap-1 shrink-0"
                            title="Expand text"
                        >
                            <Expand className="h-3.5 w-3.5" />
                            <span>Expand</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleImproveText(editor, 'simplify')}
                            disabled={isImproving}
                            className="h-7 px-2 text-xs gap-1 shrink-0"
                            title="Simplify text"
                        >
                            <Minimize2 className="h-3.5 w-3.5" />
                            <span>Simplify</span>
                        </Button>
                        <div className="w-px h-5 bg-border mx-0.5 shrink-0" />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleImproveText(editor, 'formal')}
                            disabled={isImproving}
                            className="h-7 px-2 text-xs gap-1 shrink-0"
                            title="Make formal"
                        >
                            <Briefcase className="h-3.5 w-3.5" />
                            <span>Formal</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleImproveText(editor, 'casual')}
                            disabled={isImproving}
                            className="h-7 px-2 text-xs gap-1 shrink-0"
                            title="Make casual"
                        >
                            <MessageCircle className="h-3.5 w-3.5" />
                            <span>Casual</span>
                        </Button>
                    </div>
                </BubbleMenu>
            )}

            <main className="flex-1 overflow-auto relative">
                <div className="w-full h-full">
                    <EditorContent
                        editor={editor}
                    />
                </div>
            </main>
        </SidebarInset>
    );
};
