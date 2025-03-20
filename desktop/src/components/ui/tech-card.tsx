import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Code } from 'lucide-react';
import { useState } from 'react';
import { Button } from './button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './card';

export type TechVersionType = {
  version: string;
  selected?: boolean;
};

export type TechCardProps = {
  id: string;
  name: string;
  versions: string[];
  selected?: boolean;
  onSelect?: () => void;
  onVersionSelect?: (version: string) => void;
  selectedVersion?: string;
  className?: string;
};

export function TechCard({
  id,
  name,
  versions,
  selected = false,
  onSelect,
  onVersionSelect,
  selectedVersion,
  className,
}: TechCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card 
      className={cn(
        'group relative overflow-hidden transition-all duration-300',
        selected ? 'glass-deep glass-depth-2' : 'glass-surface',
        selected && 'glass-bioluminescent',
        className
      )}
    >
      <CardHeader className="relative pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className={cn(
            "text-lg transition-all",
            selected && "text-primary dark:text-primary-foreground"
          )}>
            {name}
          </CardTitle>
        </div>
      </CardHeader>
      
      <CardContent className="pb-2 space-y-2">
        {versions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {versions.slice(0, expanded ? versions.length : 3).map(version => (
              <Button
                key={version}
                variant={version === selectedVersion ? "default" : "outline"}
                size="sm"
                className={cn(
                  "text-xs",
                  version === selectedVersion ? "glass-button" : "glass bg-muted/20"
                )}
                onClick={() => onVersionSelect?.(version)}
              >
                {version}
              </Button>
            ))}
            {!expanded && versions.length > 3 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
              >
                +{versions.length - 3} more
              </Button>
            )}
          </div>
        )}
      </CardContent>
      
      <CardFooter className="flex justify-between pt-2">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="text-xs flex items-center gap-1 hover:bg-muted/30 transition-all"
          disabled={versions.length <= 3}
        >
          {expanded && versions.length > 3 ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              Show Less
            </>
          ) : versions.length > 3 ? (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              Show All Versions
            </>
          ) : <span></span>}
        </Button>
        
        <div className="flex gap-2">
          <Button 
            variant={selected ? "default" : "outline"}
            size="sm" 
            onClick={onSelect}
            className={cn(
              selected && "glass-button glass-current"
            )}>
            <Code className="h-3.5 w-3.5 mr-1" />
            {selected ? "Selected" : "Select"}
          </Button>
        </div>
      </CardFooter>
      
      {selected && (
        <motion.div
          className="absolute bottom-0 left-0 w-full h-1 bg-primary/30"
          layoutId={`tech-selection-${id}`}
        />
      )}
    </Card>
  );
}