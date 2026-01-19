'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Bot,
    Send,
    Loader2,
    Sparkles,
    X,
    ChevronRight,
    ListPlus,
    FileText,
    GripVertical
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthContext } from '@/components/AuthProvider';
import { API_BASE_URL } from '@/types/canvas';
import { cn } from '@/lib/utils';

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    isStreaming?: boolean;
    toolCalls?: ToolCall[];
}

interface ToolCall {
    name: string;
    status: 'running' | 'completed' | 'error';
    result?: string;
}

interface AgentChatProps {
    canvasId: string;
    onCanvasModified: () => void;
    isOpen: boolean;
    onToggle: () => void;
}

// SSE event types from backend
interface SSEEvent {
    event: 'started' | 'tool_call' | 'tool_result' | 'response' | 'completed' | 'error';
    message?: string;
    tool_name?: string;
    tool_args?: Record<string, unknown>;
    result?: string;
    error?: string;
    canvas_id?: string;
}

const WELCOME_MESSAGE: Message = {
    id: 'welcome',
    role: 'assistant',
    content: `Hi! I'm your Canvas Agent. I can help you modify your document. Try commands like:

• "Replace all 'X' with 'Y'"
• "Add a conclusion section"
• "Create a task list with [items]"
• "Search for 'keyword'"`,
    timestamp: new Date()
};

// Tool name to friendly name mapping
const toolDisplayNames: Record<string, string> = {
    'get_canvas_text': 'Reading canvas',
    'search_canvas': 'Searching',
    'replace_text': 'Replacing text',
    'add_section': 'Adding section',
    'add_bullet_list': 'Adding bullet list',
    'add_task_list': 'Adding task list',
    'add_code_block': 'Adding code block',
};

// Resize constraints
const MIN_WIDTH = 280;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 320;

export function AgentChat({ canvasId, onCanvasModified, isOpen, onToggle }: AgentChatProps) {
    const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [width, setWidth] = useState(DEFAULT_WIDTH);
    const [isResizing, setIsResizing] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const resizeRef = useRef<HTMLDivElement>(null);
    const { getAccessToken, refreshCredits } = useAuthContext();

    // Generate unique ID
    const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        if (scrollRef.current) {
            const scrollElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (scrollElement) {
                scrollElement.scrollTop = scrollElement.scrollHeight;
            }
        }
    }, [messages]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    // Handle resize
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;

            // Calculate new width based on mouse position from right edge
            const newWidth = window.innerWidth - e.clientX;

            // Clamp to min/max
            const clampedWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth));
            setWidth(clampedWidth);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            // Prevent text selection while resizing
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'ew-resize';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };
    }, [isResizing]);

    // Parse SSE data from stream
    const parseSSELine = (line: string): SSEEvent | null => {
        if (!line.startsWith('data: ')) return null;
        try {
            const jsonStr = line.slice(6); // Remove 'data: ' prefix
            return JSON.parse(jsonStr);
        } catch {
            return null;
        }
    };

    // Extract text content from message (handles both string and object formats)
    const extractMessageContent = (message: unknown): string => {
        if (typeof message === 'string') {
            return message;
        }
        if (message && typeof message === 'object') {
            // Handle LLM response format: {type, text, extras}
            if ('text' in message && typeof (message as { text: unknown }).text === 'string') {
                return (message as { text: string }).text;
            }
            // Handle content array format from some LLMs
            if ('content' in message && typeof (message as { content: unknown }).content === 'string') {
                return (message as { content: string }).content;
            }
        }
        return '';
    };

    const handleSend = useCallback(async () => {
        if (!input.trim() || isProcessing) return;

        const userMessage: Message = {
            id: generateId(),
            role: 'user',
            content: input.trim(),
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsProcessing(true);

        // Create streaming assistant message
        const assistantMessageId = generateId();
        const streamingMessage: Message = {
            id: assistantMessageId,
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            isStreaming: true,
            toolCalls: []
        };
        setMessages(prev => [...prev, streamingMessage]);

        try {
            const token = await getAccessToken();
            if (!token) {
                throw new Error('Not authenticated');
            }

            // Create abort controller for cancellation
            abortControllerRef.current = new AbortController();

            const response = await fetch(`${API_BASE_URL}/agent/execute-stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    canvas_id: canvasId,
                    query: userMessage.content,
                }),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Session expired. Please sign in again.');
                }
                if (response.status === 402) {
                    throw new Error('Insufficient credits.');
                }
                if (response.status === 404) {
                    throw new Error('Canvas not found.');
                }
                throw new Error(`Request failed: ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No response stream');
            }

            const decoder = new TextDecoder();
            let buffer = '';
            let finalResponse = '';
            const toolCalls: ToolCall[] = [];
            let streamComplete = false;

            // Read stream until done or we receive a terminal event
            while (!streamComplete) {
                const { done, value } = await reader.read();

                // Stream ended naturally
                if (done) {
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) continue;

                    const event = parseSSELine(trimmedLine);
                    if (!event) continue;

                    switch (event.event) {
                        case 'started':
                            // Update message to show agent is working
                            setMessages(prev => prev.map(msg =>
                                msg.id === assistantMessageId
                                    ? { ...msg, content: 'Processing your request...' }
                                    : msg
                            ));
                            break;

                        case 'tool_call': {
                            // Add tool call to the list
                            const newToolCall: ToolCall = {
                                name: event.tool_name || 'unknown',
                                status: 'running'
                            };
                            toolCalls.push(newToolCall);
                            setMessages(prev => prev.map(msg =>
                                msg.id === assistantMessageId
                                    ? { ...msg, toolCalls: [...toolCalls] }
                                    : msg
                            ));
                            break;
                        }

                        case 'tool_result': {
                            // Update the last tool call with result
                            const lastToolIndex = toolCalls.findIndex(
                                tc => tc.name === event.tool_name && tc.status === 'running'
                            );
                            if (lastToolIndex !== -1) {
                                toolCalls[lastToolIndex] = {
                                    ...toolCalls[lastToolIndex],
                                    status: 'completed',
                                    result: typeof event.result === 'string'
                                        ? event.result
                                        : JSON.stringify(event.result)
                                };
                                setMessages(prev => prev.map(msg =>
                                    msg.id === assistantMessageId
                                        ? { ...msg, toolCalls: [...toolCalls] }
                                        : msg
                                ));
                            }
                            break;
                        }

                        case 'response':
                            // Update with final response (handle object format from LLM)
                            finalResponse = extractMessageContent(event.message);
                            setMessages(prev => prev.map(msg =>
                                msg.id === assistantMessageId
                                    ? { ...msg, content: finalResponse }
                                    : msg
                            ));
                            break;

                        case 'completed':
                            // Finalize the message (handle object format from LLM)
                            setMessages(prev => prev.map(msg =>
                                msg.id === assistantMessageId
                                    ? {
                                        ...msg,
                                        content: finalResponse || extractMessageContent(event.message) || 'Task completed!',
                                        isStreaming: false,
                                        toolCalls: toolCalls.length > 0 ? toolCalls : undefined
                                    }
                                    : msg
                            ));

                            // Reload canvas if modified
                            onCanvasModified();

                            // Refresh credits
                            refreshCredits();

                            // Mark stream as complete to exit loop
                            streamComplete = true;
                            break;

                        case 'error':
                            // Show error message
                            setMessages(prev => prev.map(msg =>
                                msg.id === assistantMessageId
                                    ? {
                                        ...msg,
                                        content: `Error: ${event.error || 'Something went wrong'}`,
                                        isStreaming: false
                                    }
                                    : msg
                            ));
                            toast.error(event.error || 'Failed to complete task');

                            // Mark stream as complete to exit loop
                            streamComplete = true;
                            break;
                    }

                    // Exit line processing if stream is complete
                    if (streamComplete) break;
                }
            }

            // Clean up: cancel the reader if still active
            reader.cancel().catch(() => { });

        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                // Request was cancelled
                setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessageId
                        ? { ...msg, content: 'Request cancelled.', isStreaming: false }
                        : msg
                ));
            } else {
                const errorMessage = error instanceof Error ? error.message : 'Something went wrong';
                setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessageId
                        ? { ...msg, content: `Error: ${errorMessage}`, isStreaming: false }
                        : msg
                ));
                toast.error(errorMessage);
            }
        } finally {
            setIsProcessing(false);
            abortControllerRef.current = null;
        }
    }, [input, isProcessing, canvasId, getAccessToken, onCanvasModified, refreshCredits]);

    // Handle cancel
    const handleCancel = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };

    // Quick action handlers
    const quickActions = [
        { label: 'Add Summary', prompt: 'Add a summary section at the end', icon: FileText },
        { label: 'Task List', prompt: 'Create a task list for', icon: ListPlus },
    ];

    // Collapsed state - just show toggle button
    if (!isOpen) {
        return (
            <div className="h-screen flex-shrink-0 border-l bg-background flex items-center">
                <Button
                    onClick={onToggle}
                    variant="ghost"
                    size="icon"
                    className="h-12 w-8 rounded-none rounded-l-md hover:bg-accent"
                    title="Open Agent Chat"
                >
                    <Bot className="h-4 w-4" />
                </Button>
            </div>
        );
    }

    return (
        <div
            className="agent-chat-sidebar flex-shrink-0 flex h-screen bg-background border-l relative"
            style={{ width: `${width}px` }}
        >
            {/* Resize Handle */}
            <div
                ref={resizeRef}
                onMouseDown={handleMouseDown}
                className={cn(
                    "absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize z-10 group",
                    "hover:bg-primary/20 transition-colors",
                    isResizing && "bg-primary/30"
                )}
            >
                <div className={cn(
                    "absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2",
                    "w-4 h-8 flex items-center justify-center",
                    "opacity-0 group-hover:opacity-100 transition-opacity",
                    isResizing && "opacity-100"
                )}>
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                </div>
            </div>

            {/* Main Content */}
            <div className="flex flex-col h-full w-full">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b bg-muted/30 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                            <Bot className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-sm leading-tight">Canvas Agent</h3>
                            <p className="text-xs text-muted-foreground">AI Assistant</p>
                        </div>
                    </div>
                    <Button
                        onClick={onToggle}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-accent"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
                    <div className="p-4 space-y-4">
                        {messages.map((message) => (
                            <div
                                key={message.id}
                                className={cn(
                                    'flex gap-3',
                                    message.role === 'user' ? 'justify-end' : 'justify-start'
                                )}
                            >
                                {message.role === 'assistant' && (
                                    <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                                        <Bot className="h-3.5 w-3.5 text-primary" />
                                    </div>
                                )}

                                <div
                                    className={cn(
                                        'max-w-[85%] rounded-xl px-3.5 py-2.5',
                                        message.role === 'user'
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-muted/80'
                                    )}
                                >
                                    {/* Tool calls display */}
                                    {message.toolCalls && message.toolCalls.length > 0 && (
                                        <div className="mb-2 space-y-1.5">
                                            {message.toolCalls.map((tool, idx) => (
                                                <div
                                                    key={idx}
                                                    className={cn(
                                                        'flex items-center gap-2 text-xs rounded-md px-2 py-1',
                                                        tool.status === 'running'
                                                            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                                            : 'bg-green-500/10 text-green-600 dark:text-green-400'
                                                    )}
                                                >
                                                    {tool.status === 'running' ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                        <Sparkles className="h-3 w-3" />
                                                    )}
                                                    <span className="font-medium">
                                                        {toolDisplayNames[tool.name] || tool.name}
                                                    </span>
                                                    {tool.status === 'completed' && tool.result && (
                                                        <span className="opacity-70 truncate max-w-[100px]">
                                                            - {tool.result}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Message content */}
                                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                                        {message.content}
                                        {message.isStreaming && !message.content && (
                                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                Thinking...
                                            </span>
                                        )}
                                    </p>

                                    {/* Timestamp */}
                                    <p className={cn(
                                        'text-[10px] mt-1.5',
                                        message.role === 'user'
                                            ? 'text-primary-foreground/60'
                                            : 'text-muted-foreground'
                                    )}>
                                        {message.timestamp.toLocaleTimeString([], {
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </p>
                                </div>

                                {message.role === 'user' && (
                                    <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary flex items-center justify-center mt-0.5">
                                        <span className="text-[10px] text-primary-foreground font-medium">
                                            You
                                        </span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </ScrollArea>

                {/* Input Area */}
                <div className="p-4 border-t bg-background flex-shrink-0">
                    {/* Quick Actions */}
                    <div className="flex gap-2 mb-3 flex-wrap">
                        {quickActions.map((action) => (
                            <Button
                                key={action.label}
                                variant="outline"
                                size="sm"
                                onClick={() => setInput(action.prompt)}
                                disabled={isProcessing}
                                className="text-xs h-8 px-3 rounded-full"
                            >
                                <action.icon className="h-3.5 w-3.5 mr-1.5" />
                                {action.label}
                            </Button>
                        ))}
                    </div>

                    {/* Input Field */}
                    <div className="flex gap-2 items-center">
                        <Input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            placeholder="Ask me to modify the canvas..."
                            disabled={isProcessing}
                            className="flex-1 text-sm h-10 rounded-lg"
                        />
                        {isProcessing ? (
                            <Button
                                onClick={handleCancel}
                                size="icon"
                                variant="destructive"
                                className="h-10 w-10 rounded-lg flex-shrink-0"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        ) : (
                            <Button
                                onClick={handleSend}
                                disabled={!input.trim()}
                                size="icon"
                                className="h-10 w-10 rounded-lg flex-shrink-0"
                            >
                                <Send className="h-4 w-4" />
                            </Button>
                        )}
                    </div>

                    {/* Processing indicator */}
                    {isProcessing && (
                        <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Agent is working...</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
