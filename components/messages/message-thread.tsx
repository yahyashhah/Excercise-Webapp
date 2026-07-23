"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { sendMessageAction, markMessagesReadAction } from "@/actions/message-actions";
import { formatRelativeTime } from "@/lib/utils/formatting";
import { toast } from "sonner";
import { Send, Loader2, Check, CheckCheck, Mic } from "lucide-react";
import { getPusherClient } from "@/lib/pusher-client";
import { threadChannel } from "@/lib/pusher-channels";
import { VoiceMessageRecorder } from "./voice-message-recorder";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Message {
  id: string;
  senderId: string;
  content: string;
  audioUrl?: string | null;
  audioDurationSec?: number | null;
  createdAt: Date;
  isRead?: boolean;
  readAt?: Date | string | null;
  sender: { firstName: string; lastName: string; imageUrl: string | null };
}

interface MessageThreadProps {
  messages: Message[];
  currentUserId: string;
  recipientId: string;
  recipientName: string;
}

export function MessageThread({
  messages: initialMessages,
  currentUserId,
  recipientId,
  recipientName,
}: MessageThreadProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [recipientTyping, setRecipientTyping] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, recipientTyping]);

  useEffect(() => {
    const pusher = getPusherClient();
    const channel = pusher.subscribe(threadChannel(currentUserId, recipientId));

    channel.bind(
      "new-message",
      (data: Omit<Message, "createdAt"> & { createdAt: string }) => {
        const msg: Message = { ...data, createdAt: new Date(data.createdAt) };
        setMessages((prev) =>
          prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
        );
        setRecipientTyping(false);
        if (typingClearRef.current) clearTimeout(typingClearRef.current);

        // Immediately mark as read — user is actively viewing this thread
        if (msg.senderId === recipientId) {
          markMessagesReadAction(recipientId).catch(() => {});
        }
      },
    );

    channel.bind("messages-read", (data: { readByUserId: string }) => {
      if (data.readByUserId !== recipientId) return;
      const now = new Date();
      setMessages((prev) =>
        prev.map((m) =>
          m.senderId === currentUserId && !m.isRead
            ? { ...m, isRead: true, readAt: now }
            : m,
        ),
      );
    });

    channel.bind("client-typing", (data: { userId: string }) => {
      if (data.userId !== recipientId) return;
      setRecipientTyping(true);
      if (typingClearRef.current) clearTimeout(typingClearRef.current);
      typingClearRef.current = setTimeout(() => setRecipientTyping(false), 2000);
    });

    return () => {
      if (typingClearRef.current) clearTimeout(typingClearRef.current);
      if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
      pusher.unsubscribe(threadChannel(currentUserId, recipientId));
    };
  }, [currentUserId, recipientId]);

  const triggerTyping = useCallback(() => {
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    typingDebounceRef.current = setTimeout(() => {
      const ch = getPusherClient().channel(threadChannel(currentUserId, recipientId));
      ch?.trigger("client-typing", { userId: currentUserId });
    }, 300);
  }, [currentUserId, recipientId]);

  async function handleSend() {
    if (!content.trim()) return;
    setSending(true);
    const result = await sendMessageAction({ recipientId, content: content.trim() });
    setSending(false);
    if (result.success) {
      setContent("");
    } else {
      toast.error(result.error);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const recipientInitials = recipientName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border p-4">
        <h2 className="font-semibold text-foreground">{recipientName}</h2>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((msg) => {
            const isOwn = msg.senderId === currentUserId;
            return (
              <div key={msg.id} className={`flex gap-3 ${isOwn ? "flex-row-reverse" : ""}`}>
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarImage src={msg.sender.imageUrl || undefined} />
                  <AvatarFallback className="text-xs">
                    {msg.sender.firstName[0]}
                    {msg.sender.lastName[0]}
                  </AvatarFallback>
                </Avatar>
                <div className={`max-w-[70%] ${isOwn ? "text-right" : ""}`}>
                  {msg.audioUrl ? (
                    <div
                      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 ${
                        isOwn ? "bg-blue-600" : "bg-muted"
                      }`}
                    >
                      <Mic className={`h-3.5 w-3.5 shrink-0 ${isOwn ? "text-white" : "text-muted-foreground"}`} />
                      <audio src={msg.audioUrl} controls className="h-8 max-w-[220px]" />
                    </div>
                  ) : (
                    <div
                      className={`inline-block rounded-lg px-4 py-2 text-sm ${
                        isOwn ? "bg-blue-600 text-white" : "bg-muted text-foreground"
                      }`}
                    >
                      {msg.content}
                    </div>
                  )}
                  <div
                    className={`mt-1 flex items-center gap-1 text-xs text-muted-foreground/60 ${
                      isOwn ? "justify-end" : ""
                    }`}
                  >
                    <span>{formatRelativeTime(msg.createdAt)}</span>
                    {isOwn && <ReadIndicator isRead={!!msg.isRead} readAt={msg.readAt} />}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Typing indicator */}
          {recipientTyping && (
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarFallback className="bg-muted text-xs">{recipientInitials}</AvatarFallback>
              </Avatar>
              <div className="inline-flex items-center gap-1 rounded-2xl bg-muted px-4 py-3">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:300ms]" />
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border p-4">
        {showRecorder ? (
          <VoiceMessageRecorder
            recipientId={recipientId}
            onSent={() => setShowRecorder(false)}
            onCancel={() => setShowRecorder(false)}
          />
        ) : (
          <div className="flex gap-2">
            <Textarea
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                triggerTyping();
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="min-h-[2.5rem] resize-none"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowRecorder(true)}
              aria-label="Record a voice note"
            >
              <Mic className="h-4 w-4" />
            </Button>
            <Button onClick={handleSend} disabled={sending || !content.trim()} size="icon">
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ReadIndicator({ isRead, readAt }: { isRead: boolean; readAt?: Date | string | null }) {
  if (!isRead) {
    return <Check className="h-3.5 w-3.5" aria-label="Sent" />;
  }

  const readLabel = readAt
    ? `Read ${new Date(readAt).toLocaleString()}`
    : "Read";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={<span className="inline-flex items-center" aria-label={readLabel} />}
        >
          <CheckCheck className="h-3.5 w-3.5 text-blue-500" />
        </TooltipTrigger>
        <TooltipContent>{readLabel}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
