"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Loader2, Search } from "lucide-react";

export type SearchResultItem = {
  title: string;
  text?: string;
  documentViewerUrl?: string;
  site?: string;
  lastModified?: string;
  score?: number;
};

export type SearchResultsProps = {
  query: string;
  totalResults?: number;
  message?: string;
  results?: SearchResultItem[];
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  errorText?: string;
  // Optional: expected count to render skeletons while loading
  expectedCount?: number;
};

export function SearchResults({
  query,
  totalResults,
  message,
  results = [],
  state,
  errorText,
  expectedCount = 3,
}: SearchResultsProps) {
  if (state === "output-error") {
    return (
      <div className="text-sm text-destructive p-3 bg-destructive/10 rounded-lg">
        Error: {errorText}
      </div>
    );
  }

  if (state === "input-streaming") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Searching SharePoint…
      </div>
    );
  }

  if (state === "input-available") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Search className="h-4 w-4" />
          <div>
            Searching for <span className="font-medium text-foreground">“{query}”</span>
          </div>
        </div>
        <div className="grid gap-2">
          {Array.from({ length: expectedCount }).map((_, i) => (
            <Card key={i} className="p-3 animate-pulse">
              <div className="h-4 w-2/3 bg-muted rounded mb-2" />
              <div className="h-3 w-full bg-muted rounded mb-1" />
              <div className="h-3 w-5/6 bg-muted rounded" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // output-available
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        {message ?? (typeof totalResults === "number" ? `Found ${totalResults} results for “${query}”` : undefined)}
      </div>
      <div className="space-y-2">
        {results.map((r, i) => (
          <Card key={i} className="p-3 bg-muted/30 border">
            <div className="flex items-start justify-between gap-3 mb-1">
              <h4 className="font-medium text-sm leading-tight line-clamp-2">{r.title}</h4>
              {typeof r.score === "number" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {(r.score * 100).toFixed(0)}%
                </span>
              )}
            </div>

            {r.text && (
              <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                {r.text}
              </p>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="truncate">
                {(r.site || "Unknown Site")} {r.lastModified ? `• ${r.lastModified}` : ""}
              </div>
              {r.documentViewerUrl && (
                <a
                  href={r.documentViewerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </Card>
        ))}
      </div>
      <Separator />
    </div>
  );
}


