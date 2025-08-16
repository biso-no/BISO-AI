"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

type CodeBlockProps = {
  code: string | React.ReactNode;
  language?: string;
  className?: string;
};

export function CodeBlock({ code, language, className }: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);
  const text = typeof code === "string" ? code : undefined;

  async function handleCopy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      const t = setTimeout(() => setCopied(false), 1500);
      return () => clearTimeout(t);
    } catch {}
  }

  return (
    <div className={`group relative overflow-hidden rounded-xl border bg-muted ${className ?? ""}`}>
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <div className="text-xs font-mono text-muted-foreground">
          {language ? language.toUpperCase() : "CODE"}
        </div>
        {text && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleCopy}
          >
            {copied ? (
              <>
                <Check className="mr-1 h-3.5 w-3.5" /> Copied
              </>
            ) : (
              <>
                <Copy className="mr-1 h-3.5 w-3.5" /> Copy
              </>
            )}
          </Button>
        )}
      </div>
      <pre className="overflow-x-auto p-3 text-sm leading-relaxed">
        {typeof code === "string" ? code : code}
      </pre>
    </div>
  );
}

export default CodeBlock;



