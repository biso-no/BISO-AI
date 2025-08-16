"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

type PromptSuggestionsProps = {
  onPick: (text: string) => void;
  items?: string[];
};

const DEFAULT_SUGGESTIONS = [
  "Summarize key insights from today's SharePoint updates",
  "Find policies about remote work and extract the essentials",
  "Compare Q2 financial highlights from uploaded documents",
  "Draft an email based on the latest release notes",
];

export function PromptSuggestions({ onPick, items = DEFAULT_SUGGESTIONS }: PromptSuggestionsProps) {
  if (!items?.length) return null;
  return (
    <div className="my-2 grid gap-2 sm:grid-cols-2">
      {items.map((s, i) => (
        <Button key={i} variant="secondary" size="sm" className="justify-start" onClick={() => onPick(s)}>
          <Sparkles className="mr-2 h-4 w-4" /> {s}
        </Button>
      ))}
    </div>
  );
}

export default PromptSuggestions;



