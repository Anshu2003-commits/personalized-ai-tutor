"use client";

import * as React from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { cn } from "@/lib/utils";

const ResizablePanelGroup = React.forwardRef<
  React.ComponentRef<typeof PanelGroup>,
  React.ComponentProps<typeof PanelGroup>
>(({ className, ...props }, ref) => {
  return (
    <PanelGroup
      ref={ref}
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
        className,
      )}
      {...props}
    />
  );
});
ResizablePanelGroup.displayName = "ResizablePanelGroup";

const ResizablePanel = Panel;

function ResizableHandle({
  className,
  ...props
}: React.ComponentProps<typeof PanelResizeHandle>) {
  return (
    <PanelResizeHandle
      data-slot="resizable-handle"
      className={cn(
        // 1px divider with a wide invisible hit area; brightens on hover/drag.
        "relative w-px shrink-0 bg-border outline-none transition-colors",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2 after:content-['']",
        "data-[resize-handle-state=hover]:bg-foreground/25 data-[resize-handle-state=drag]:bg-foreground/40",
        "focus-visible:bg-foreground/40",
        className,
      )}
      {...props}
    />
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
