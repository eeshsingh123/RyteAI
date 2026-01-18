'use client';

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent, JSONContent, Editor, BubbleMenu } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Typography from "@tiptap/extension-typography";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import { common, createLowlight } from "lowlight";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { toast } from "sonner";
import { AIResponse } from "./AgentMarks";
import { SlashCommands } from "./SlashCommands";
import { markdownToHtml, containsMarkdown, cleanMarkdown } from "@/lib/markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    SidebarInset,
} from "@/components/ui/sidebar";
import {
    Save,
    ArrowLeft,
    Bold,
    Italic,
    Underline as UnderlineIcon,
    Strikethrough,
    List,
    ListOrdered,
    FileText,
    Heading1,
    Heading2,
    Heading3,
    Quote,
    Code,
    Code2,
    CheckCircle,
    Bot,
    Sparkles,
    RefreshCw,
    AlignLeft,
    Expand,
    Minimize2,
    Briefcase,
    MessageCircle,
    Loader2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Link as LinkIcon,
    Highlighter,
    Minus,
    CheckSquare,
    Undo,
    Redo,
    Type,
    Pilcrow,
} from "lucide-react";
import { Canvas } from "@/types/canvas";
import { useCanvasApi, ImproveAction } from "@/hooks/useCanvasApi";

// Create lowlight instance for code highlighting
const lowlight = createLowlight(common);

// Rate limiting constants
const MIN_LLM_CALL_INTERVAL = 2000;

interface CanvasEditorProps {
    canvasId: string;
    currentCanvas: Canvas | null;
    onCanvasUpdate: (canvas: Canvas) => void;
}

// Toolbar button component for consistency
const ToolbarButton = ({
    onClick,
    isActive = false,
    disabled = false,
    tooltip,
    children
}: {
    onClick: () => void;
    isActive?: boolean;
    disabled?: boolean;
    tooltip: string;
    children: React.ReactNode;
}) => (
    <TooltipProvider delayDuration={300}>
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClick}
                    disabled={disabled}
                    className={`h-8 w-8 p-0 ${isActive ? 'bg-accent text-accent-foreground' : ''}`}
                >
                    {children}
                </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
                {tooltip}
            </TooltipContent>
        </Tooltip>
    </TooltipProvider>
);

// Divider component
const ToolbarDivider = () => (
    <div className="w-px h-6 bg-border mx-1" />
);

export const CanvasEditor = ({ canvasId, currentCanvas, onCanvasUpdate }: CanvasEditorProps) => {
    const router = useRouter();
    const { updateCanvas, executeInstruction, improveText } = useCanvasApi();
    const [canvasName, setCanvasName] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isAutoSaving, setIsAutoSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [isProcessingInstruction, setIsProcessingInstruction] = useState(false);
    const [isImproving, setIsImproving] = useState(false);
    const [showMoreOptions, setShowMoreOptions] = useState(false);

    // Rate limiting for LLM calls
    const lastLLMCallRef = useRef<number>(0);

    // Insert markdown content into editor (parses markdown to HTML first)
    const insertMarkdownContent = useCallback((editor: Editor, content: string, from: number, to: number) => {
        const cleanedContent = cleanMarkdown(content);

        // Check if content contains markdown
        if (containsMarkdown(cleanedContent)) {
            // Convert markdown to HTML and insert
            const html = markdownToHtml(cleanedContent);
            editor.chain()
                .setTextSelection({ from, to })
                .deleteSelection()
                .insertContent(html, {
                    parseOptions: {
                        preserveWhitespace: false,
                    }
                })
                .run();
        } else {
            // Plain text - insert directly
            editor.chain()
                .setTextSelection({ from, to })
                .insertContent(cleanedContent)
                .run();
        }
    }, []);

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
                // Use markdown-aware insertion
                insertMarkdownContent(editor, improvedText, from, to);

                // Get the new selection range after insertion
                const newTo = editor.state.selection.to;
                const insertedFrom = from;
                const insertedTo = newTo;

                // Apply green highlight to the improved text
                setTimeout(() => {
                    if (editor && !editor.isDestroyed) {
                        editor.chain()
                            .setTextSelection({ from: insertedFrom, to: insertedTo })
                            .setMark('aiResponse')
                            .setTextSelection(insertedTo)
                            .run();

                        // Remove highlight after 5 seconds by removing all aiResponse marks from the document
                        setTimeout(() => {
                            if (editor && !editor.isDestroyed) {
                                // Remove all aiResponse marks from the entire document
                                const { doc } = editor.state;
                                const tr = editor.state.tr;
                                doc.descendants((node, pos) => {
                                    if (node.isText) {
                                        const marks = node.marks.filter(mark => mark.type.name === 'aiResponse');
                                        if (marks.length > 0) {
                                            tr.removeMark(pos, pos + node.nodeSize, editor.schema.marks.aiResponse);
                                        }
                                    }
                                });
                                editor.view.dispatch(tr);
                            }
                        }, 5000);
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
    }, [currentCanvas, canvasId, improveText, isImproving, insertMarkdownContent]);

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
                // Use markdown-aware insertion
                insertMarkdownContent(editor, response, lineStart, lineEnd);

                // Get the new selection range after insertion
                const newTo = editor.state.selection.to;
                const insertedFrom = lineStart;
                const insertedTo = newTo;

                // Apply green highlight to the response text
                setTimeout(() => {
                    if (editor && !editor.isDestroyed) {
                        editor.chain()
                            .setTextSelection({ from: insertedFrom, to: insertedTo })
                            .setMark('aiResponse')
                            .setTextSelection(insertedTo)
                            .run();

                        // Remove highlight after 5 seconds by removing all aiResponse marks from the document
                        setTimeout(() => {
                            if (editor && !editor.isDestroyed) {
                                // Remove all aiResponse marks from the entire document
                                const { doc } = editor.state;
                                const tr = editor.state.tr;
                                doc.descendants((node, pos) => {
                                    if (node.isText) {
                                        const marks = node.marks.filter(mark => mark.type.name === 'aiResponse');
                                        if (marks.length > 0) {
                                            tr.removeMark(pos, pos + node.nodeSize, editor.schema.marks.aiResponse);
                                        }
                                    }
                                });
                                editor.view.dispatch(tr);
                            }
                        }, 5000);
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
    }, [currentCanvas, canvasId, executeInstruction, isProcessingInstruction, insertMarkdownContent]);

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
                        const agentPattern = /@agent\s*[^\n\r]*/gi;
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

                    const agentPattern = /^@agent\s+(.+)$/i;
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

    // Initialize editor with all extensions
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                codeBlock: false, // We use CodeBlockLowlight instead
                horizontalRule: false, // We use our own
            }),
            Placeholder.configure({
                placeholder: ({ node }) => {
                    if (node.type.name === 'heading') {
                        return 'Heading';
                    }
                    return 'Type \'/\' for commands, or \'@agent\' for AI...';
                },
            }),
            Underline,
            Link.configure({
                openOnClick: false,
                HTMLAttributes: {
                    class: 'text-primary underline cursor-pointer',
                },
            }),
            Highlight.configure({
                multicolor: false,
            }),
            TaskList.configure({
                HTMLAttributes: {
                    class: 'task-list',
                },
            }),
            TaskItem.configure({
                nested: true,
                HTMLAttributes: {
                    class: 'task-item',
                },
            }),
            CodeBlockLowlight.configure({
                lowlight,
                HTMLAttributes: {
                    class: 'code-block',
                },
            }),
            Typography,
            HorizontalRule,
            AIResponse,
            AgentExtension,
            SlashCommands,
        ],
        content: '',
        editorProps: {
            attributes: {
                class: 'canvas-editor-content max-w-none min-h-[calc(100vh-200px)] focus:outline-none px-12 py-8',
            },
            handlePaste: (view, event) => {
                const clipboardData = event.clipboardData;
                if (!clipboardData) return false;

                const text = clipboardData.getData('text/plain');

                // Check if pasted text contains markdown
                if (text && containsMarkdown(text)) {
                    event.preventDefault();

                    const html = markdownToHtml(cleanMarkdown(text));
                    const { from, to } = view.state.selection;

                    // Create a new editor transaction
                    editor?.chain()
                        .setTextSelection({ from, to })
                        .insertContent(html, {
                            parseOptions: {
                                preserveWhitespace: false,
                            }
                        })
                        .run();

                    return true;
                }

                return false;
            },
        },
        onUpdate: () => {
            handleAutoSave();
        },
    });

    // Separate refs for different types of saves
    const contentDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const titleDebounceRef = useRef<NodeJS.Timeout | null>(null);

    // Helper function to strip aiResponse marks from JSON content before saving
    // This prevents temporary highlight marks from being persisted
    const stripAiResponseMarks = useCallback((content: JSONContent): JSONContent => {
        const stripFromNode = (node: JSONContent): JSONContent => {
            const result = { ...node };

            // Remove aiResponse from marks array
            if (result.marks) {
                result.marks = result.marks.filter(mark =>
                    typeof mark === 'string' ? mark !== 'aiResponse' : mark.type !== 'aiResponse'
                );
                if (result.marks.length === 0) {
                    delete result.marks;
                }
            }

            // Recursively process content array
            if (result.content && Array.isArray(result.content)) {
                result.content = result.content.map(stripFromNode);
            }

            return result;
        };

        return stripFromNode(content);
    }, []);

    // Extract common save logic
    const saveCanvas = useCallback(async (name: string, content: JSONContent) => {
        if (!currentCanvas) return;

        // Strip temporary aiResponse marks before saving
        const cleanContent = stripAiResponseMarks(content);

        setIsAutoSaving(true);
        try {
            const updatedCanvas = await updateCanvas(canvasId, {
                name,
                content: cleanContent
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
    }, [currentCanvas, canvasId, updateCanvas, onCanvasUpdate, stripAiResponseMarks]);

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
            // Strip temporary aiResponse marks before saving
            const cleanContent = stripAiResponseMarks(content);
            const updatedCanvas = await updateCanvas(canvasId, {
                name: canvasName,
                content: cleanContent
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
    }, [currentCanvas, editor, canvasId, canvasName, updateCanvas, onCanvasUpdate, stripAiResponseMarks]);

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

    // Add link handler
    const setLink = useCallback(() => {
        if (!editor) return;

        const previousUrl = editor.getAttributes('link').href;
        const url = window.prompt('Enter URL', previousUrl);

        if (url === null) return;

        if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
        }

        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }, [editor]);

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
        <SidebarInset className="flex flex-col h-screen overflow-hidden">
            <header className="flex h-14 shrink-0 items-center px-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                {/* Centered title */}
                <div className="flex-1 flex justify-center">
                    <Input
                        value={canvasName}
                        onChange={(e) => handleTitleChange(e.target.value)}
                        className="text-center text-base font-medium border-none shadow-none focus-visible:ring-1 focus-visible:ring-ring max-w-md h-9 bg-transparent"
                        placeholder="Untitled Canvas"
                    />
                </div>

                {/* Save status and button - right side */}
                <div className="absolute right-4 flex items-center gap-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {isAutoSaving && (
                            <div className="flex items-center gap-1.5">
                                <div className="animate-spin rounded-full h-3 w-3 border-b border-primary"></div>
                                <span>Saving...</span>
                            </div>
                        )}
                        {lastSaved && !isAutoSaving && (
                            <div className="flex items-center gap-1.5">
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
                        className="h-8"
                    >
                        <Save className="h-3.5 w-3.5 mr-1.5" />
                        {isSaving ? 'Saving...' : 'Save'}
                    </Button>
                </div>
            </header>

            {/* Professional Toolbar */}
            {editor && (
                <div className="flex items-center gap-0.5 px-4 py-2 border-b bg-muted/30">
                    {/* Undo/Redo */}
                    <ToolbarButton
                        onClick={() => editor.chain().focus().undo().run()}
                        disabled={!editor.can().undo()}
                        tooltip="Undo (Ctrl+Z)"
                    >
                        <Undo className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().redo().run()}
                        disabled={!editor.can().redo()}
                        tooltip="Redo (Ctrl+Y)"
                    >
                        <Redo className="h-4 w-4" />
                    </ToolbarButton>

                    <ToolbarDivider />

                    {/* Block Type Dropdown */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 gap-1 px-2">
                                <Pilcrow className="h-4 w-4" />
                                <span className="text-xs hidden sm:inline">
                                    {editor.isActive('heading', { level: 1 }) ? 'Heading 1' :
                                        editor.isActive('heading', { level: 2 }) ? 'Heading 2' :
                                            editor.isActive('heading', { level: 3 }) ? 'Heading 3' :
                                                editor.isActive('codeBlock') ? 'Code' :
                                                    editor.isActive('blockquote') ? 'Quote' :
                                                        'Paragraph'}
                                </span>
                                <ChevronDown className="h-3 w-3" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="min-w-[180px]">
                            <DropdownMenuItem onClick={() => editor.chain().focus().setParagraph().run()}>
                                <Type className="h-4 w-4 mr-2" />
                                Paragraph
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
                                <Heading1 className="h-4 w-4 mr-2" />
                                Heading 1
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
                                <Heading2 className="h-4 w-4 mr-2" />
                                Heading 2
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
                                <Heading3 className="h-4 w-4 mr-2" />
                                Heading 3
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
                                <Code2 className="h-4 w-4 mr-2" />
                                Code Block
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => editor.chain().focus().toggleBlockquote().run()}>
                                <Quote className="h-4 w-4 mr-2" />
                                Quote
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <ToolbarDivider />

                    {/* Text Formatting */}
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        isActive={editor.isActive('bold')}
                        tooltip="Bold (Ctrl+B)"
                    >
                        <Bold className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        isActive={editor.isActive('italic')}
                        tooltip="Italic (Ctrl+I)"
                    >
                        <Italic className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        isActive={editor.isActive('underline')}
                        tooltip="Underline (Ctrl+U)"
                    >
                        <UnderlineIcon className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleStrike().run()}
                        isActive={editor.isActive('strike')}
                        tooltip="Strikethrough"
                    >
                        <Strikethrough className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleCode().run()}
                        isActive={editor.isActive('code')}
                        tooltip="Inline Code"
                    >
                        <Code className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleHighlight().run()}
                        isActive={editor.isActive('highlight')}
                        tooltip="Highlight"
                    >
                        <Highlighter className="h-4 w-4" />
                    </ToolbarButton>

                    <ToolbarDivider />

                    {/* Lists */}
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        isActive={editor.isActive('bulletList')}
                        tooltip="Bullet List"
                    >
                        <List className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        isActive={editor.isActive('orderedList')}
                        tooltip="Numbered List"
                    >
                        <ListOrdered className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleTaskList().run()}
                        isActive={editor.isActive('taskList')}
                        tooltip="Task List"
                    >
                        <CheckSquare className="h-4 w-4" />
                    </ToolbarButton>

                    <ToolbarDivider />

                    {/* Insert */}
                    <ToolbarButton
                        onClick={setLink}
                        isActive={editor.isActive('link')}
                        tooltip="Add Link"
                    >
                        <LinkIcon className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().setHorizontalRule().run()}
                        tooltip="Divider"
                    >
                        <Minus className="h-4 w-4" />
                    </ToolbarButton>

                    {/* Right side info */}
                    <div className="flex-1" />
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {isProcessingInstruction && (
                            <div className="flex items-center gap-1.5">
                                <Bot className="h-3.5 w-3.5 animate-pulse text-blue-500" />
                                <span>Processing...</span>
                            </div>
                        )}
                        <span className="hidden md:inline opacity-60">
                            Type <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">/</kbd> for commands
                        </span>
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
                    <div className="flex flex-wrap items-center gap-0.5 bg-popover border border-border rounded-lg shadow-xl p-1 max-w-[95vw]">
                        {/* Text formatting in bubble menu */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => editor.chain().focus().toggleBold().run()}
                            className={`h-7 w-7 p-0 ${editor.isActive('bold') ? 'bg-accent' : ''}`}
                        >
                            <Bold className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => editor.chain().focus().toggleItalic().run()}
                            className={`h-7 w-7 p-0 ${editor.isActive('italic') ? 'bg-accent' : ''}`}
                        >
                            <Italic className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => editor.chain().focus().toggleUnderline().run()}
                            className={`h-7 w-7 p-0 ${editor.isActive('underline') ? 'bg-accent' : ''}`}
                        >
                            <UnderlineIcon className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => editor.chain().focus().toggleStrike().run()}
                            className={`h-7 w-7 p-0 ${editor.isActive('strike') ? 'bg-accent' : ''}`}
                        >
                            <Strikethrough className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => editor.chain().focus().toggleCode().run()}
                            className={`h-7 w-7 p-0 ${editor.isActive('code') ? 'bg-accent' : ''}`}
                        >
                            <Code className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={setLink}
                            className={`h-7 w-7 p-0 ${editor.isActive('link') ? 'bg-accent' : ''}`}
                        >
                            <LinkIcon className="h-3.5 w-3.5" />
                        </Button>

                        <div className="w-px h-5 bg-border mx-0.5" />

                        {/* AI Actions */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleImproveText(editor, 'improve')}
                            disabled={isImproving}
                            className="h-7 px-2 text-xs gap-1"
                            title="Improve writing"
                        >
                            {isImproving ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Sparkles className="h-3.5 w-3.5" />
                            )}
                            <span className="hidden sm:inline">Improve</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleImproveText(editor, 'rephrase')}
                            disabled={isImproving}
                            className="h-7 px-2 text-xs gap-1"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Rephrase</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleImproveText(editor, 'summarize')}
                            disabled={isImproving}
                            className="h-7 px-2 text-xs gap-1"
                        >
                            <AlignLeft className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Summarize</span>
                        </Button>

                        {/* More AI options - expandable inline */}
                        {showMoreOptions ? (
                            <>
                                <div className="w-px h-5 bg-border mx-0.5" />
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleImproveText(editor, 'expand')}
                                    disabled={isImproving}
                                    className="h-7 px-2 text-xs gap-1"
                                >
                                    <Expand className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">Expand</span>
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleImproveText(editor, 'simplify')}
                                    disabled={isImproving}
                                    className="h-7 px-2 text-xs gap-1"
                                >
                                    <Minimize2 className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">Simplify</span>
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleImproveText(editor, 'formal')}
                                    disabled={isImproving}
                                    className="h-7 px-2 text-xs gap-1"
                                >
                                    <Briefcase className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">Formal</span>
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleImproveText(editor, 'casual')}
                                    disabled={isImproving}
                                    className="h-7 px-2 text-xs gap-1"
                                >
                                    <MessageCircle className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">Casual</span>
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowMoreOptions(false)}
                                    className="h-7 px-2 text-xs gap-1"
                                >
                                    <ChevronLeft className="h-3 w-3" />
                                    <span className="hidden sm:inline">Less</span>
                                </Button>
                            </>
                        ) : (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowMoreOptions(true)}
                                disabled={isImproving}
                                className="h-7 px-2 text-xs gap-1"
                            >
                                <span className="hidden sm:inline">More</span>
                                <ChevronRight className="h-3 w-3" />
                            </Button>
                        )}
                    </div>
                </BubbleMenu>
            )}

            <main className="flex-1 overflow-auto relative">
                <div className="w-full h-full max-w-4xl mx-auto">
                    <EditorContent
                        editor={editor}
                    />
                </div>
            </main>
        </SidebarInset>
    );
};
