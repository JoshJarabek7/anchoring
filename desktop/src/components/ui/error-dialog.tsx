import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { AlertCircle, AlertTriangle, X } from "lucide-react";
import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./dialog";

export interface ErrorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  message: string;
  details?: string;
  severity?: "warning" | "error" | "critical";
  onRetry?: () => void;
}

export function ErrorDialog({
  open,
  onOpenChange,
  title = "Error Occurred",
  message,
  details,
  severity = "error",
  onRetry,
}: ErrorDialogProps) {
  const Icon = severity === "warning" ? AlertTriangle : AlertCircle;

  const severityColor = {
    warning: "text-amber-500",
    error: "text-red-500",
    critical: "text-red-600",
  };

  const severityBg = {
    warning: "bg-amber-500/10",
    error: "bg-red-500/10",
    critical: "bg-red-600/10",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "glass-abyss wave-disrupted",
          severityBg[severity],
          "border-red-500/20 dark:border-red-800/30"
        )}
      >
        <DialogHeader className="flex flex-row items-center gap-3">
          <motion.div
            initial={{ rotate: 0 }}
            animate={{ rotate: [0, -10, 10, -5, 0] }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Icon className={cn("h-6 w-6", severityColor[severity])} />
          </motion.div>

          <DialogTitle className="flex-1">{title}</DialogTitle>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DialogDescription className="sr-only">
          {severity} alert: {message}
        </DialogDescription>

        <div className="py-4 space-y-4">
          <div className="glass-surface p-4 rounded-md relative overflow-hidden">
            <motion.p className="text-base">{message}</motion.p>

            {/* Water disruption effect */}
            <motion.div
              className="absolute inset-0 opacity-10 pointer-events-none"
              animate={{
                backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"],
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                repeatType: "reverse",
              }}
              style={{
                backgroundImage: `radial-gradient(
                  circle at 50% 50%,
                  ${
                    severity === "warning"
                      ? "rgba(245, 158, 11, 0.4)"
                      : "rgba(239, 68, 68, 0.4)"
                  },
                  transparent 60%
                )`,
                backgroundSize: "200% 200%",
                mixBlendMode: "overlay",
              }}
            />
          </div>

          {details && (
            <div className="glass-deep glass-depth-1 p-3 rounded-md max-h-[200px] overflow-y-auto text-sm opacity-80 font-mono">
              {details}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          {onRetry && (
            <Button onClick={onRetry} className="glass-surface">
              Retry
            </Button>
          )}

          <Button onClick={() => onOpenChange(false)} className="glass-surface">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
