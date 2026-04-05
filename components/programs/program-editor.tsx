"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  createProgramSchema,
  type CreateProgramInput,
  type WorkoutInput,
} from "@/lib/validators/program";
import {
  createProgramAction,
  updateProgramAction,
} from "@/actions/program-actions";
import { ProgramBuilder } from "./program-builder";

interface Props {
  program?: Record<string, unknown>;
  exercises: {
    id: string;
    name: string;
    bodyRegion: string;
    difficultyLevel: string;
    defaultReps?: number | null;
    musclesTargeted?: string[];
    imageUrl?: string | null;
  }[];
}

// Helper to map DB workout to input type
function mapWorkoutToInput(w: Record<string, unknown>): WorkoutInput {
  return {
    id: w.id as string,
    name: w.name as string,
    description: w.description as string | null | undefined,
    dayIndex: w.dayIndex as number,
    weekIndex: w.weekIndex as number,
    orderIndex: w.orderIndex as number,
    estimatedMinutes: w.estimatedMinutes as number | null | undefined,
    blocks: ((w.blocks as Record<string, unknown>[]) || []).map(
      (b: Record<string, unknown>, bi: number) => ({
        id: b.id as string,
        name: b.name as string | null | undefined,
        type: ((b.type as string) || "NORMAL") as "NORMAL" | "SUPERSET" | "CIRCUIT" | "AMRAP" | "EMOM",
        orderIndex: bi,
        rounds: (b.rounds as number) || 1,
        restBetweenRounds: b.restBetweenRounds as number | null | undefined,
        timeCap: b.timeCap as number | null | undefined,
        notes: b.notes as string | null | undefined,
        exercises: (
          (b.exercises as Record<string, unknown>[]) || []
        ).map((e: Record<string, unknown>, ei: number) => ({
          id: e.id as string,
          exerciseId: e.exerciseId as string,
          orderIndex: ei,
          restSeconds: e.restSeconds as number | null | undefined,
          notes: e.notes as string | null | undefined,
          supersetGroup: e.supersetGroup as string | null | undefined,
          _exerciseName: (e.exercise as Record<string, unknown>)?.name as
            | string
            | undefined,
          _exerciseBodyRegion: (e.exercise as Record<string, unknown>)
            ?.bodyRegion as string | undefined,
          sets: ((e.sets as Record<string, unknown>[]) || []).map(
            (s: Record<string, unknown>, si: number) => ({
              id: s.id as string,
              orderIndex: si,
              setType: ((s.setType as string) || "NORMAL") as "NORMAL" | "WARMUP" | "DROP_SET" | "FAILURE",
              targetReps: s.targetReps as number | null | undefined,
              targetWeight: s.targetWeight as number | null | undefined,
              targetDuration: s.targetDuration as number | null | undefined,
              targetDistance: s.targetDistance as number | null | undefined,
              targetRPE: s.targetRPE as number | null | undefined,
              restAfter: s.restAfter as number | null | undefined,
            })
          ),
        })),
      })
    ),
  };
}

export function ProgramEditor({ program, exercises }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [workouts, setWorkouts] = useState<WorkoutInput[]>(
    program
      ? ((program.workouts as Record<string, unknown>[]) || []).map(
          mapWorkoutToInput
        )
      : []
  );

  const form = useForm<CreateProgramInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createProgramSchema) as any,
    defaultValues: {
      name: (program?.name as string) || "",
      description: (program?.description as string) || "",
      isTemplate: (program?.isTemplate as boolean) || false,
      durationWeeks: (program?.durationWeeks as number) || undefined,
      daysPerWeek: (program?.daysPerWeek as number) || undefined,
      tags: (program?.tags as string[]) || [],
      workouts: [],
    },
  });

  async function onSubmit(data: CreateProgramInput) {
    setSaving(true);
    try {
      // Strip UI-only fields from workouts before sending
      const cleanWorkouts = workouts.map((w) => ({
        ...w,
        blocks: w.blocks.map((b) => ({
          ...b,
          exercises: b.exercises.map((e) => {
            const { _exerciseName, _exerciseBodyRegion, ...rest } = e as Record<
              string,
              unknown
            > &
              typeof e;
            void _exerciseName;
            void _exerciseBodyRegion;
            return rest;
          }),
        })),
      }));
      data.workouts = cleanWorkouts;

      if (program) {
        const result = await updateProgramAction(
          program.id as string,
          data
        );
        if (result.success) {
          toast.success("Program updated");
          router.push(`/programs/${program.id}`);
        } else {
          toast.error(result.error);
        }
      } else {
        const result = await createProgramAction(data);
        if (result.success) {
          toast.success("Program created");
          router.push(`/programs/${result.data.id}`);
        } else {
          toast.error(result.error);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Metadata Card */}
        <Card>
          <CardHeader>
            <CardTitle>Program Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Program Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., 12-Week Strength Program"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Program description..."
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="durationWeeks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration (weeks)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={52}
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value ? parseInt(e.target.value) : undefined
                        )
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="daysPerWeek"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Days per week</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value?.toString() || ""}
                      onValueChange={(v) => field.onChange(v ? parseInt(v) : undefined)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                          <SelectItem key={n} value={n.toString()}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isTemplate"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3 sm:col-span-2">
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="!mt-0">Save as template</FormLabel>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Program Builder */}
        <ProgramBuilder
          workouts={workouts}
          onChange={setWorkouts}
          exerciseLibrary={exercises}
        />

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving
              ? "Saving..."
              : program
                ? "Update Program"
                : "Create Program"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
