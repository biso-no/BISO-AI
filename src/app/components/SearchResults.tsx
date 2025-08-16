"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ExternalLink, Loader2, Search, ChevronDown } from "lucide-react";

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
  languageInfo?: {
    norwegianDocs?: number;
    englishDocs?: number;
    authoritativeDocs?: number;
    latestVersions?: number;
    totalResults?: number;
  };
};

export function SearchResults({
  query,
  totalResults,
  message,
  results = [],
  state,
  errorText,
  expectedCount = 3,
  languageInfo,
}: SearchResultsProps) {
  const [showDetails, setShowDetails] = React.useState(false);
  const [openItems, setOpenItems] = React.useState<string[]>([]);
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
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          {message ?? (typeof totalResults === "number" ? `Found ${totalResults} results for “${query}”` : undefined)}
        </span>
        {typeof languageInfo?.norwegianDocs === "number" && languageInfo.norwegianDocs > 0 && (
          <Badge variant="outline">NO {languageInfo.norwegianDocs}</Badge>
        )}
        {typeof languageInfo?.englishDocs === "number" && languageInfo.englishDocs > 0 && (
          <Badge variant="outline">EN {languageInfo.englishDocs}</Badge>
        )}
        {typeof languageInfo?.authoritativeDocs === "number" && languageInfo.authoritativeDocs > 0 && (
          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" variant="secondary">
            Authoritative {languageInfo.authoritativeDocs}
          </Badge>
        )}
      </div>

      <Accordion type="multiple" value={openItems} onValueChange={(v) => setOpenItems(v as string[])} className="rounded-xl border bg-muted/30">
        <AccordionItem value="results" className="border-0">
          <AccordionTrigger className="px-3 py-2 hover:no-underline">
            <div className="flex w-full items-center justify-between">
              <div className="text-sm font-medium">Search results</div>
              <div className="text-xs text-muted-foreground">{(totalResults ?? results.length) || 0} items</div>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-1 px-3 pb-3">
              {results.map((r, i) => (
                <div key={i} className="group rounded-lg border bg-background/50 p-3 transition hover:bg-muted/40">
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <a
                      className="font-medium text-sm leading-tight text-foreground hover:underline"
                      href={r.documentViewerUrl || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {r.title}
                    </a>
                    {typeof r.score === "number" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {(r.score * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  {r.text && (
                    <p className="mb-2 line-clamp-2 text-sm text-muted-foreground">{r.text}</p>
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="truncate">{r.site || 'Unknown Site'} {r.lastModified ? `• ${r.lastModified}` : ''}</div>
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
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <button
        type="button"
        onClick={() => setShowDetails((s) => !s)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
      >
        {showDetails ? 'Hide search details' : 'Show search details'}
        <ChevronDown className={`h-3 w-3 transition ${showDetails ? 'rotate-180' : ''}`} />
      </button>

      {showDetails && (
        <Card className="p-3 text-sm">
          <div className="mb-2 font-medium">Tool call</div>
          <div className="grid gap-1 text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">Query:</span> {query}
            </div>
            {typeof totalResults === 'number' && (
              <div>
                <span className="font-medium text-foreground">Total results:</span> {totalResults}
              </div>
            )}
            {languageInfo && (
              <div className="text-xs">
                <div>Norwegian: {languageInfo.norwegianDocs ?? 0} • English: {languageInfo.englishDocs ?? 0}</div>
                <div>Authoritative: {languageInfo.authoritativeDocs ?? 0} • Latest versions: {languageInfo.latestVersions ?? 0}</div>
              </div>
            )}
          </div>
        </Card>
      )}

      <Separator />
    </div>
  );
}


