"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { sendMessageAction } from "@/actions/message-actions";
import { formatRelativeTime } from "@/lib/utils/formatting";
import { toast } from "sonner";
import { Send, Loader2 } from "lucide-react";

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
  messages,
  currentUserId,
  recipientId,
  recipientName,
}: MessageThreadProps) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend() {
    if (!content.trim()) return;

    setSending(true);
    const result = await sendMessageAction({
      recipientId,
      content: content.trim(),
    });

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
                    {msg.sender.firstName[0]}{msg.sender.lastName[0]}
                  </AvatarFallback>
                </Avatar>
                <div className={`max-w-[70%] ${isOwn ? "text-right" : ""}`}>
                  <div
                    className={`inline-block rounded-lg px-4 py-2 text-sm ${
                      isOwn
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-900"
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
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-slate-200 p-4">
        <div className="flex gap-2">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="min-h-[2.5rem] resize-none"
          />
          <Button onClick={handleSend} disabled={sending || !content.trim()} size="icon">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
