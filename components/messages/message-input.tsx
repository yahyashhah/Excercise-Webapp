"use client";

import { useState } from "react";
import { toast } from "sonner";
import { sendMessageAction as sendMessage } from "@/actions/message-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";

interface MessageInputProps {
  recipientId: string;
  planId?: string;
}

export function MessageInput({ recipientId, planId }: MessageInputProps) {
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!content.trim()) return;
    setIsSending(true);

    const result = await sendMessage({
      recipientId,
      content: content.trim(),
      planId: planId ?? undefined,
    });

    if (result.success) {
      setContent("");
    } else {
      toast.error(result.error ?? "Failed to send message");
    }
    setIsSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex items-end gap-2 p-4 border-t">
      <Textarea
        placeholder="Type a message..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        className="min-h-[40px] max-h-[120px] resize-none"
      />
      <Button
        size="sm"
        onClick={handleSend}
        disabled={isSending || !content.trim()}
      >
        {isSending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
