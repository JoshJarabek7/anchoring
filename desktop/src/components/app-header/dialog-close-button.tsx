import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import React from "react";

interface DialogCloseButtonProps {
  onClick?: () => void;
  className?: string;
}

export const DialogCloseButton = React.memo(
  ({ onClick, className }: DialogCloseButtonProps) => {
    const handleClick = React.useCallback(
      (_: React.MouseEvent<HTMLButtonElement>) => {
        // Call the provided onClick handler if it exists
        if (onClick) onClick();
      },
      [onClick]
    );

    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={handleClick}
        className={cn("h-7 w-7 text-foreground dialog-close-button", className)}
        type="button"
      >
        <X className="h-4 w-4" />
      </Button>
    );
  }
);

DialogCloseButton.displayName = "DialogCloseButton";
