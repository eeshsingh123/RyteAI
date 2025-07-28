import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FileText, Star, MoreHorizontal, Trash2 } from "lucide-react";
import { Canvas } from "@/types/canvas";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CanvasItemProps {
    canvas: Canvas;
    onToggleFavorite: (canvasId: string, isFavorite: boolean) => void;
    onDelete: (canvasId: string) => void;
    isCurrentCanvas?: boolean;
}

export const CanvasItem = ({
    canvas,
    onToggleFavorite,
    onDelete,
    isCurrentCanvas = false
}: CanvasItemProps) => {
    const router = useRouter();

    const handleToggleFavorite = () => {
        onToggleFavorite(canvas.id, !canvas.is_favorite);
    };

    const handleDelete = () => {
        onDelete(canvas.id);
    };

    const handleToggleFavoriteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        handleToggleFavorite();
    };

    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        handleDelete();
    };

    const handleClick = () => {
        router.push(`/canvas/${canvas.id}`);
    };

    return (
        <div
            className={`group flex items-center gap-3 p-1 rounded-lg border cursor-pointer transition-colors hover:bg-accent/50 ${isCurrentCanvas ? 'bg-accent' : 'bg-card'
                }`}
            onClick={handleClick}
        >
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />

            <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm truncate">{canvas.name}</h3>
            </div>

            <span className="text-xs text-muted-foreground shrink-0">
                {canvas.updated_at.toLocaleDateString()}
            </span>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleToggleFavoriteClick}>
                        <Star className={`h-4 w-4 ${canvas.is_favorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                        {canvas.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDeleteClick} variant="destructive">
                        <Trash2 className="h-4 w-4" />
                        Delete canvas
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}; 