import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
    Sidebar,
    SidebarContent,
    SidebarHeader,
    SidebarTrigger,
} from "@/components/ui/sidebar";
import {
    Plus,
    FileText,
    Search,
    Heart,
    Calendar
} from "lucide-react";
import { Canvas } from "@/types/canvas";
import { CanvasItem } from "./CanvasItem";

interface CanvasSidebarProps {
    canvases: Canvas[];
    onCreateCanvas: () => void;
    onToggleFavorite: (canvasId: string, isFavorite: boolean) => void;
    onDelete: (canvasId: string) => void;
    isLoading: boolean;
    isInitialLoading: boolean;
    currentCanvasId?: string;
}

export const CanvasSidebar = ({
    canvases,
    onCreateCanvas,
    onToggleFavorite,
    onDelete,
    isLoading,
    isInitialLoading,
    currentCanvasId
}: CanvasSidebarProps) => {
    const [searchTerm, setSearchTerm] = useState("");

    // Filter canvases based on search term
    const filteredCanvases = canvases.filter(canvas =>
        canvas.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        canvas.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const favoriteCanvases = filteredCanvases.filter(canvas => canvas.is_favorite);
    const regularCanvases = filteredCanvases.filter(canvas => !canvas.is_favorite);

    return (
        <Sidebar collapsible="icon" className="w-80">
            <SidebarHeader className="p-4">
                <div className="flex justify-between items-center gap-2">
                    <div className="flex items-center gap-2">
                        <FileText className="h-6 w-6 shrink-0" />
                        <h2 className="text-lg font-semibold group-data-[collapsible=icon]:hidden">My Canvases</h2>
                    </div>
                    <SidebarTrigger />
                </div>
            </SidebarHeader>

            <SidebarContent className="px-4">
                <div className="space-y-4">
                    {/* Create Canvas Button */}
                    <Button
                        onClick={onCreateCanvas}
                        disabled={isLoading}
                        className="w-full justify-start group-data-[collapsible=icon]:justify-center"
                    >
                        <Plus className="h-4 w-4 group-data-[collapsible=icon]:mr-0 mr-2" />
                        <span className="group-data-[collapsible=icon]:hidden">
                            {isLoading ? 'Creating...' : 'Create New Canvas'}
                        </span>
                    </Button>

                    {/* Search */}
                    <div className="relative group-data-[collapsible=icon]:hidden">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search canvases..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>

                    {/* Favorites Section */}
                    {favoriteCanvases.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 px-2">
                                <Heart className="h-4 w-4 text-red-500 shrink-0 group-data-[collapsible=icon]:hidden" />
                                <h3 className="font-medium text-sm group-data-[collapsible=icon]:hidden">Favorites</h3>
                            </div>
                            <ScrollArea className="h-48 group-data-[collapsible=icon]:hidden">
                                <div className="space-y-2">
                                    {favoriteCanvases.map((canvas) => (
                                        <CanvasItem
                                            key={canvas.id}
                                            canvas={canvas}
                                            onToggleFavorite={onToggleFavorite}
                                            onDelete={onDelete}
                                            isCurrentCanvas={canvas.id === currentCanvasId}
                                        />
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>
                    )}

                    {favoriteCanvases.length > 0 && regularCanvases.length > 0 && (
                        <Separator />
                    )}

                    {/* All Canvases Section */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 px-2">
                            <Calendar className="h-4 w-4 text-muted-foreground shrink-0 group-data-[collapsible=icon]:hidden" />
                            <h3 className="font-medium text-sm group-data-[collapsible=icon]:hidden">Recent</h3>
                        </div>
                        <ScrollArea className="h-96 group-data-[collapsible=icon]:hidden">
                            <div className="space-y-2">
                                {regularCanvases.map((canvas) => (
                                    <CanvasItem
                                        key={canvas.id}
                                        canvas={canvas}
                                        onToggleFavorite={onToggleFavorite}
                                        onDelete={onDelete}
                                        isCurrentCanvas={canvas.id === currentCanvasId}
                                    />
                                ))}
                            </div>
                        </ScrollArea>
                    </div>

                    {/* Loading State */}
                    {isInitialLoading && (
                        <div className="text-center py-8 text-muted-foreground">
                            <FileText className="h-8 w-8 mx-auto mb-2" />
                            <p className="text-sm group-data-[collapsible=icon]:hidden">Loading canvases...</p>
                        </div>
                    )}

                    {/* Empty State */}
                    {!isInitialLoading && filteredCanvases.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                            <div className="group-data-[collapsible=icon]:hidden">
                                <FileText className="h-8 w-8 mx-auto mb-2" />
                                <p className="text-sm">No canvases found</p>
                                <p className="text-xs">
                                    {searchTerm
                                        ? "Try adjusting your search terms"
                                        : "Create your first canvas to get started"
                                    }
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </SidebarContent>
        </Sidebar>
    );
}; 