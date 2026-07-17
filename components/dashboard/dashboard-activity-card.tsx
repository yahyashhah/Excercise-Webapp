import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, MessageSquareText, Inbox, Sparkles } from "lucide-react";
import { formatFeedbackRating, formatRelativeTime } from "@/lib/utils/formatting";
import { RecentMessagesList } from "@/components/dashboard/recent-messages-list";
import { AiInsightsList } from "@/components/dashboard/ai-insights-list";
import type { getInboxThreads } from "@/lib/services/message.service";

interface RecentFeedback {
  id: string;
  rating: string;
  comment: string | null;
  createdAt: Date;
  client: { firstName: string; lastName: string };
  planExercise: { exercise: { name: string } };
}

interface DashboardActivityCardProps {
  recentFeedback: RecentFeedback[];
  recentMessages: Awaited<ReturnType<typeof getInboxThreads>>;
}

const feedbackColors: Record<string, string> = {
  FELT_GOOD: "bg-success/10 text-success border-success/30",
  MILD_DISCOMFORT: "bg-amber-500/10 text-amber-700 border-amber-200",
  PAINFUL: "bg-red-500/10 text-red-700 border-red-200",
  UNSURE_HOW_TO_PERFORM: "bg-muted text-muted-foreground border-border",
};

function FeedbackList({ recentFeedback }: { recentFeedback: RecentFeedback[] }) {
  if (recentFeedback.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <MessageSquare className="h-10 w-10 text-muted-foreground/30" />
        <p className="mt-3 text-sm font-medium text-muted-foreground">No feedback yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {recentFeedback.map((fb) => (
        <div
          key={fb.id}
          className="rounded-xl border border-border/60 p-3 transition-colors hover:bg-muted/30"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {fb.client.firstName} {fb.client.lastName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {fb.planExercise.exercise.name}
              </p>
            </div>
            <Badge
              className={`shrink-0 border text-[10px] font-semibold ${feedbackColors[fb.rating] || "bg-muted text-muted-foreground border-border"}`}
            >
              {formatFeedbackRating(fb.rating)}
            </Badge>
          </div>
          {fb.comment && (
            <p className="mt-2 line-clamp-2 text-xs italic text-muted-foreground/80">
              &ldquo;{fb.comment}&rdquo;
            </p>
          )}
          <p className="mt-1.5 text-[10px] text-muted-foreground/50">
            {formatRelativeTime(fb.createdAt)}
          </p>
        </div>
      ))}
    </div>
  );
}

export function DashboardActivityCard({
  recentFeedback,
  recentMessages,
}: DashboardActivityCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <Tabs defaultValue="feedback">
          <TabsList className="mb-4">
            <TabsTrigger value="feedback">
              <MessageSquareText />
              Feedback
            </TabsTrigger>
            <TabsTrigger value="messages">
              <Inbox />
              Messages
            </TabsTrigger>
            <TabsTrigger value="insights">
              <Sparkles />
              AI Insights
            </TabsTrigger>
          </TabsList>

          <TabsContent value="feedback">
            <FeedbackList recentFeedback={recentFeedback} />
          </TabsContent>

          <TabsContent value="messages">
            <RecentMessagesList messages={recentMessages} />
          </TabsContent>

          <TabsContent value="insights">
            <AiInsightsList />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
