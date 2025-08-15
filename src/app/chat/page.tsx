"use client";

// Premium Chatbot UI built for Vercel AI SDK v5
// - Beautiful, modern, and premium-feeling UI
// - Full tool-calling support (automatic + human-in-the-loop)
// - Uses useChat v5 API: messages, status, error, sendMessage, stop, clearError, addToolResult, resumeStream
// - TailwindCSS + shadcn/ui + lucide-react
// - Copy this file into a Next.js Client Component (e.g., app/page.tsx) and ensure Tailwind + shadcn are set up
// - See server route example at the bottom of this file

import * as React from "react";
import { useRef, useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { z } from "zod";
import { motion } from "framer-motion";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { SearchResults } from "@/app/components/SearchResults";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  CircleStop,
  SendHorizonal,
  RotateCcw,
  TriangleAlert,
  Sparkles,
  Loader2,
  Bot,
  User,
  Check,
  X,
} from "lucide-react";

// ---------- Helper functions ----------
const extractSourcesFromMessage = (message: any) => {
  const sources: Array<{ title: string; url: string }> = [];
  
  if (message.parts) {
    message.parts.forEach((part: any) => {
      // Handle both new tool-searchSharePoint format and old dynamic-tool format
      const isSearchSharePointTool = 
        (part.type === "tool-searchSharePoint") ||
        (part.type === "dynamic-tool" && part.toolName === "searchSharePoint");
        
      if (isSearchSharePointTool && part.state === "output-available") {
        if (part.output?.results && Array.isArray(part.output.results)) {
          part.output.results.forEach((result: any) => {
            if (result.documentViewerUrl && result.title) {
              sources.push({
                title: result.title,
                url: result.documentViewerUrl
              });
            }
          });
        }
      }
    });
  }
  
  return sources;
};

// ---------- Helper UI bits ----------
const Bubble = ({ role, children }: { role: "user" | "assistant" | "system"; children: React.ReactNode }) => {
  const isUser = role === "user";
  return (
    <div className={`flex items-start gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary/10 text-primary"><Bot className="h-4 w-4" /></AvatarFallback>
        </Avatar>
      )}
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-3 shadow-sm ring-1 ${
          isUser
            ? "bg-primary text-primary-foreground ring-primary/40"
            : "bg-card ring-border"
        }`}
      >
        {children}
      </div>
      {isUser && (
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-muted"><User className="h-4 w-4" /></AvatarFallback>
        </Avatar>
      )}
    </div>
  );
};

const PartCode = ({ label, obj }: { label: string; obj: unknown }) => (
  <div className="mt-2 text-xs">
    <div className="mb-1 font-medium text-muted-foreground">{label}</div>
    <pre className="whitespace-pre-wrap rounded-xl bg-muted p-3 text-muted-foreground ring-1 ring-border">
      {JSON.stringify(obj, null, 2)}
    </pre>
  </div>
);

// ---------- Main Chat Component ----------
export default function PremiumChat() {
  // NOTE: the destructure matches your snippet exactly
  const {
    messages,
    status,
    error,
    sendMessage,
    stop,
    clearError,
    addToolResult,
    resumeStream,
  } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    // When all tool results are present, automatically submit to continue the run
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    // Auto-run simple client-side tools (demo: getLocation)
    async onToolCall({ toolCall }) {
      if (toolCall.toolName === "getLocation") {
        // supply a quick client-side result (no await to avoid deadlocks)
        const cities = ["Oslo", "Bergen", "Trondheim", "Stavanger"];
        addToolResult({
          tool: "getLocation",
          toolCallId: toolCall.toolCallId,
          output: cities[Math.floor(Math.random() * cities.length)],
        });
      }
    },
  });

  const [input, setInput] = useState("");
  const formRef = useRef<HTMLFormElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Always keep scroll pinned to bottom on new messages
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ role: "user", parts: [{ type: "text", text: input }] });
    setInput("");
  }

  return (
    <div className="mx-auto grid min-h-[100dvh] w-full max-w-5xl grid-rows-[auto,1fr,auto] gap-4 p-4 sm:p-6">
      {/* Header */}
      <Card className="border-0 bg-gradient-to-br from-background to-muted/40 shadow-none">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-xl sm:text-2xl">Aurora Chat</CardTitle>
            <CardDescription className="mt-1 flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4" /> Powered by AI SDK v5 with tool calling
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {status === "streaming" ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={stop}>
                    <CircleStop className="mr-2 h-4 w-4" /> Stop
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Abort the current stream</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={() => resumeStream()} disabled={status !== "ready"}>
                    <RotateCcw className="mr-2 h-4 w-4" /> Resume
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Resume an interrupted stream</TooltipContent>
              </Tooltip>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Messages */}
      <Card className="relative border-0 shadow-none">
        <CardContent className="p-0">
          <ScrollArea ref={scrollRef} className="h-[58vh] rounded-2xl border bg-card p-4">
            <div className="space-y-6">
              {messages.map((m) => {
                // Debug logging - remove after testing
                console.log('Message:', m);
                console.log('Message parts:', m.parts);
                
                const sources = extractSourcesFromMessage(m);
                
                return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <Bubble role={m.role as any}>
                    {/* Render each part according to type */}
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      {m.parts.map((part: any, idx: number) => {
                        // Debug logging for parts
                        console.log('Part:', part, 'Type:', part.type);
                        
                        switch (part.type) {
                          case "text":
                            return (
                              <div key={idx} className="leading-relaxed">
                                <div className="prose prose-sm max-w-none dark:prose-invert prose-pre:bg-muted prose-pre:text-foreground">
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    rehypePlugins={[rehypeHighlight]}
                                    components={{
                                    // Customize code blocks
                                    pre: ({ children, ...props }) => (
                                      <pre className="bg-muted text-foreground p-3 rounded-lg overflow-x-auto border" {...props}>
                                        {children}
                                      </pre>
                                    ),
                                    // Customize inline code
                                    code: ({ children, className, ...props }) => {
                                      const isInline = !className;
                                      return (
                                        <code
                                          className={isInline 
                                            ? "bg-muted px-1 py-0.5 rounded text-sm font-mono" 
                                            : className
                                          }
                                          {...props}
                                        >
                                          {children}
                                        </code>
                                      );
                                    },
                                    // Customize links to open in new tab
                                    a: ({ href, children, ...props }) => (
                                      <a
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline"
                                        {...props}
                                      >
                                        {children}
                                      </a>
                                    ),
                                  }}
                                  >
                                    {part.text}
                                  </ReactMarkdown>
                                </div>
                              </div>
                            );

                          // Typed client tool (requires user interaction)
                          case "tool-askForConfirmation": {
                            const callId = part.toolCallId;
                            if (part.state === "input-streaming") {
                              return (
                                <div key={callId} className="text-muted-foreground">Loading confirmation…</div>
                              );
                            }
                            if (part.state === "input-available") {
                              return (
                                <div key={callId} className="space-y-3">
                                  <div>{part.input?.message ?? "Proceed?"}</div>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        addToolResult({
                                          tool: "askForConfirmation",
                                          toolCallId: callId,
                                          output: "Yes",
                                        })
                                      }
                                    >
                                      <Check className="mr-2 h-4 w-4" /> Yes
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() =>
                                        addToolResult({
                                          tool: "askForConfirmation",
                                          toolCallId: callId,
                                          output: "No",
                                        })
                                      }
                                    >
                                      <X className="mr-2 h-4 w-4" /> No
                                    </Button>
                                  </div>
                                </div>
                              );
                            }
                            if (part.state === "output-available") {
                              return <div key={callId}>Confirmed: {String(part.output)}</div>;
                            }
                            if (part.state === "output-error") {
                              return (
                                <div key={callId} className="text-sm text-destructive">Error: {part.errorText}</div>
                              );
                            }
                            return null;
                          }

                          // Auto-executed client tool (we provide output immediately in onToolCall)
                          case "tool-getLocation": {
                            const callId = part.toolCallId;
                            if (part.state === "input-streaming") return <div key={callId}>Finding location…</div>;
                            if (part.state === "input-available") return <div key={callId}>Getting location…</div>;
                            if (part.state === "output-available") return <div key={callId}>Location: {String(part.output)}</div>;
                            if (part.state === "output-error")
                              return <div key={callId} className="text-sm text-destructive">Error: {part.errorText}</div>;
                            return null;
                          }

                          // New tool-searchSharePoint type (Generative UI rendering)
                          case "tool-searchSharePoint": {
                            return (
                              <SearchResults
                                key={idx}
                                state={part.state}
                                query={part.input?.query ?? ''}
                                totalResults={part.output?.totalResults}
                                message={part.output?.message}
                                results={part.output?.results?.map((r: any) => ({
                                  title: r.title,
                                  text: r.text,
                                  documentViewerUrl: r.documentViewerUrl,
                                  site: r.site,
                                  lastModified: r.lastModified,
                                  score: r.score,
                                }))}
                                errorText={part.errorText}
                              />
                            );
                          }

                          // Dynamic tools (unknown at compile time, e.g., MCP)
                          case "dynamic-tool": {
                            const renderToolOutput = (toolName: string, output: any) => {
                              switch (toolName) {
                                case "searchSharePoint": {
                                  if (output?.error) {
                                    return (
                                      <div className="text-sm text-destructive p-3 bg-destructive/10 rounded-lg">
                                        Error: {output.error}
                                      </div>
                                    );
                                  }
                                  
                                  return (
                                    <div className="space-y-3">
                                      <div className="text-sm text-muted-foreground">
                                        {output.message || `Found ${output.totalResults || 0} results for "${output.query}"`}
                                      </div>
                                      {output.results && output.results.length > 0 && (
                                        <div className="space-y-2">
                                          {output.results.map((result: any, i: number) => (
                                            <div key={i} className="border rounded-lg p-3 bg-muted/30">
                                              <div className="flex justify-between items-start mb-2">
                                                <h4 className="font-medium text-sm">{result.title}</h4>
                                                <span className="text-xs text-muted-foreground">
                                                  Score: {(result.score * 100).toFixed(1)}%
                                                </span>
                                              </div>
                                              <p className="text-sm text-muted-foreground mb-2 line-clamp-3">
                                                {result.text}
                                              </p>
                                              <div className="flex justify-between items-center text-xs text-muted-foreground">
                                                <span>{result.site} • {result.lastModified}</span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                }
                                
                                case "getDocumentStats": {
                                  if (output?.error) {
                                    return (
                                      <div className="text-sm text-destructive p-3 bg-destructive/10 rounded-lg">
                                        Error: {output.error}
                                      </div>
                                    );
                                  }
                                  
                                  return (
                                    <div className="space-y-2">
                                      <div className="text-sm text-muted-foreground">
                                        {output.message || "Document Statistics"}
                                      </div>
                                      <div className="grid grid-cols-2 gap-4 p-3 bg-muted/30 rounded-lg">
                                        <div className="text-center">
                                          <div className="text-2xl font-bold text-primary">{output.totalDocuments || 0}</div>
                                          <div className="text-xs text-muted-foreground">Documents</div>
                                        </div>
                                        <div className="text-center">
                                          <div className="text-2xl font-bold text-primary">{output.totalChunks || 0}</div>
                                          <div className="text-xs text-muted-foreground">Searchable Chunks</div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                }
                                
                                case "listSharePointSites": {
                                  if (output?.error) {
                                    return (
                                      <div className="text-sm text-destructive p-3 bg-destructive/10 rounded-lg">
                                        Error: {output.error}
                                      </div>
                                    );
                                  }
                                  
                                  return (
                                    <div className="space-y-3">
                                      <div className="text-sm text-muted-foreground">
                                        {output.message || `Found ${output.totalSites || 0} SharePoint sites`}
                                      </div>
                                      {output.sites && output.sites.length > 0 && (
                                        <div className="space-y-2">
                                          {output.sites.map((site: any, i: number) => (
                                            <div key={i} className="border rounded-lg p-3 bg-muted/30">
                                              <div className="flex justify-between items-start">
                                                <div>
                                                  <h4 className="font-medium text-sm">{site.displayName || site.name}</h4>
                                                  <p className="text-xs text-muted-foreground">ID: {site.id}</p>
                                                </div>
                                                {site.webUrl && (
                                                  <a 
                                                    href={site.webUrl} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="text-primary hover:underline text-xs"
                                                  >
                                                    Open Site
                                                  </a>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                }
                                
                                case "weather": {
                                  return (
                                    <div className="p-3 bg-muted/30 rounded-lg">
                                      <div className="text-sm">
                                        Weather in <strong>{output.location}</strong>: {output.temperature}°F
                                      </div>
                                    </div>
                                  );
                                }
                                
                                default:
                                  // Fallback to JSON display for unknown tools
                                  return <PartCode label="Output" obj={output} />;
                              }
                            };

                            return (
                              <div key={idx} className="rounded-xl border p-3">
                                <div className="text-xs font-medium text-muted-foreground mb-2">Tool: {part.toolName}</div>
                                {part.state === "input-streaming" && <PartCode label="Input (streaming)" obj={part.input} />}
                                {part.state === "input-available" && <PartCode label="Input" obj={part.input} />}
                                {part.state === "output-available" && renderToolOutput(part.toolName, part.output)}
                                {part.state === "output-error" && (
                                  <div className="text-sm text-destructive">Error: {part.errorText}</div>
                                )}
                              </div>
                            );
                          }

                          case "step-start":
                            return (
                              <div key={idx} className="my-2 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
                                <Separator className="mb-2" />
                                Tool step
                              </div>
                            );

                          default:
                            // Debug: show unknown part types
                            console.log('Unknown part type:', part.type, part);
                            return (
                              <div key={idx} className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                                <div className="font-mono text-yellow-700">Unknown part type: {part.type}</div>
                                <pre className="mt-1 text-yellow-600 overflow-auto">
                                  {JSON.stringify(part, null, 2)}
                                </pre>
                              </div>
                            );
                        }
                      })}
                      
                      {/* Sources section */}
                      {sources.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-border">
                          <div className="text-xs font-medium text-muted-foreground mb-2">Sources:</div>
                          <div className="space-y-1">
                            {sources.map((source, idx) => (
                              <div key={idx}>
                                <a 
                                  href={source.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-sm text-primary hover:underline block"
                                >
                                  {source.title}
                                </a>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </Bubble>
                </motion.div>
                );
              })}

              {status === "streaming" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Generating…
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Composer */}
      <Card className="sticky bottom-0 border-0 bg-background/60 backdrop-blur">
        <CardContent className="p-3 sm:p-4">
          {error && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
              <TriangleAlert className="h-4 w-4" />
              <span className="grow">{error.message || "An error occurred"}</span>
              <Button size="sm" variant="ghost" onClick={clearError}>Dismiss</Button>
            </div>
          )}

          <form ref={formRef} onSubmit={handleSubmit} className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything…"
              className="min-h-[48px] max-h-40 resize-none rounded-2xl p-3"
            />
            <Button type="submit" disabled={status === "streaming"} className="rounded-2xl px-4">
              <SendHorizonal className="mr-2 h-4 w-4" /> Send
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex items-center justify-between px-4 pb-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-medium">Status:</span> {status}
          </div>
          <div className="hidden sm:block">Tip: tools may ask for confirmation.</div>
        </CardFooter>
      </Card>
    </div>
  );
}