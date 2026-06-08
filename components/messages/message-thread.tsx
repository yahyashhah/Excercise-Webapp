"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { sendMessageAction, markMessagesReadAction } from "@/actions/message-actions";
import { formatRelativeTime } from "@/lib/utils/formatting";
import { toast } from "sonner";
import { Send, Loader2 } from "lucide-react";
import { getPusherClient } from "@/lib/pusher-client";
import { threadChannel } from "@/lib/pusher-channels";

interface Message {
  id: string;
  senderId: string;
  content: string;
  createdAt: Date;
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
      <div className="border-b border-slate-200 p-4">
        <h2 className="font-semibold text-slate-900">{recipientName}</h2>
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
                  <div
                    className={`inline-block rounded-lg px-4 py-2 text-sm ${
                      isOwn ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-900"
                    }`}
                  >
                    {msg.content}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatRelativeTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}

          {/* Typing indicator */}
          {recipientTyping && (
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarFallback className="bg-slate-200 text-xs">{recipientInitials}</AvatarFallback>
              </Avatar>
              <div className="inline-flex items-center gap-1 rounded-2xl bg-slate-100 px-4 py-3">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-slate-200 p-4">
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
          <Button onClick={handleSend} disabled={sending || !content.trim()} size="icon">
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
