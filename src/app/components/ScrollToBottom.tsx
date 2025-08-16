"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

type ScrollToBottomProps = {
  targetRef: React.RefObject<HTMLElement | HTMLDivElement>;
};

export function ScrollToBottom({ targetRef }: ScrollToBottomProps) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const el = targetRef.current as HTMLElement | null;
    if (!el) return;

    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setVisible(distanceFromBottom > 120);
    };

    handleScroll();
    el.addEventListener("scroll", handleScroll, { passive: true } as any);
    return () => el.removeEventListener("scroll", handleScroll as any);
  }, [targetRef]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
      <Button
        type="button"
        size="sm"
        className="pointer-events-auto rounded-full shadow-md"
        onClick={() => targetRef.current?.scrollTo({ top: targetRef.current.scrollHeight, behavior: "smooth" })}
      >
        <ChevronDown className="mr-1.5 h-4 w-4" /> New messages
      </Button>
    </div>
  );
}

export default ScrollToBottom;



