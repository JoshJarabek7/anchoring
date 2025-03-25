import { Button } from "@/components/ui/button";
import { GlassContainer } from "@/components/ui/glass-container";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useMemo } from "react";

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  siblingsCount?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  siblingsCount = 1,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 20, 50, 100],
  className,
}: PaginationProps) {
  // Calculate displayed page numbers
  const paginationRange = useMemo(() => {
    const totalPageNumbers = siblingsCount * 2 + 3; // Start + End + Current + Siblings*2

    if (totalPageNumbers >= totalPages) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const leftSiblingIndex = Math.max(currentPage - siblingsCount, 1);
    const rightSiblingIndex = Math.min(currentPage + siblingsCount, totalPages);

    const shouldShowLeftDots = leftSiblingIndex > 2;
    const shouldShowRightDots = rightSiblingIndex < totalPages - 1;

    if (!shouldShowLeftDots && shouldShowRightDots) {
      // 1 2 3 ... 10
      const leftItemCount = 1 + 2 * siblingsCount;
      const leftRange = Array.from({ length: leftItemCount }, (_, i) => i + 1);
      return [...leftRange, "dots", totalPages];
    }

    if (shouldShowLeftDots && !shouldShowRightDots) {
      // 1 ... 8 9 10
      const rightItemCount = 1 + 2 * siblingsCount;
      const rightRange = Array.from(
        { length: rightItemCount },
        (_, i) => totalPages - rightItemCount + i + 1
      );
      return [1, "dots", ...rightRange];
    }

    if (shouldShowLeftDots && shouldShowRightDots) {
      // 1 ... 4 5 6 ... 10
      const middleRange = Array.from(
        { length: rightSiblingIndex - leftSiblingIndex + 1 },
        (_, i) => leftSiblingIndex + i
      );
      return [1, "dots", ...middleRange, "dots", totalPages];
    }

    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }, [currentPage, totalPages, siblingsCount]);

  // Case with no pages
  if (totalPages === 0) {
    return null;
  }

  const nextPage = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const firstPage = () => {
    if (currentPage !== 1) {
      onPageChange(1);
    }
  };

  const lastPage = () => {
    if (currentPage !== totalPages) {
      onPageChange(totalPages);
    }
  };

  return (
    <GlassContainer
      depth="surface"
      className={cn("flex items-center justify-between p-2", className)}
    >
      {/* Page size selector */}
      <div className="flex items-center gap-2 glass-depth-1 px-2 py-1.5 rounded-md bg-blue-700/10">
        <span className="text-xs text-foreground/70">Show</span>
        {onPageSizeChange ? (
          <Select
            value={pageSize.toString()}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger className="h-7 w-[70px] text-xs border-none">
              <SelectValue placeholder={pageSize.toString()} />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem
                  key={size}
                  value={size.toString()}
                  className="text-xs"
                >
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs">{pageSize}</span>
        )}
        <span className="text-xs text-foreground/70">per page</span>
      </div>

      {/* Range info */}
      <div className="hidden sm:flex text-xs text-foreground/70">
        <span>
          Showing {Math.min((currentPage - 1) * pageSize + 1, totalItems)} to{" "}
          {Math.min(currentPage * pageSize, totalItems)} of {totalItems}
        </span>
      </div>

      {/* Pagination controls */}
      <div className="flex items-center gap-1">
        {/* First page */}
        <Button
          variant="ghost"
          size="icon"
          className="w-7 h-7"
          onClick={firstPage}
          disabled={currentPage === 1}
          aria-label="First page"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>

        {/* Previous page */}
        <Button
          variant="ghost"
          size="icon"
          className="w-7 h-7"
          onClick={prevPage}
          disabled={currentPage === 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>

        {/* Page buttons */}
        <div className="flex items-center">
          {paginationRange.map((pageNumber, i) => {
            if (pageNumber === "dots") {
              return (
                <div
                  key={`dots-${i}`}
                  className="w-7 h-7 flex items-center justify-center"
                >
                  <span className="text-foreground/60 text-sm">...</span>
                </div>
              );
            }

            return (
              <Button
                key={pageNumber}
                variant={pageNumber === currentPage ? "default" : "ghost"}
                size="icon"
                className={cn(
                  "w-7 h-7 text-xs",
                  pageNumber === currentPage && "glass-bioluminescent"
                )}
                onClick={() => onPageChange(pageNumber as number)}
                aria-label={`Page ${pageNumber}`}
                aria-current={pageNumber === currentPage ? "page" : undefined}
              >
                {pageNumber}
              </Button>
            );
          })}
        </div>

        {/* Next page */}
        <Button
          variant="ghost"
          size="icon"
          className="w-7 h-7"
          onClick={nextPage}
          disabled={currentPage === totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>

        {/* Last page */}
        <Button
          variant="ghost"
          size="icon"
          className="w-7 h-7"
          onClick={lastPage}
          disabled={currentPage === totalPages}
          aria-label="Last page"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </GlassContainer>
  );
}
