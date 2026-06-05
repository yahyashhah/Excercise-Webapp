"use client";

import { ProgramEditor } from "@/components/programs/program-editor";
import {
  createGlobalProgramAction,
  updateGlobalProgramAction,
} from "@/actions/global-program-actions";
import type { CreateProgramInput } from "@/lib/validators/program";

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
    equipmentRequired?: string[];
  }[];
}

export function GlobalProgramEditorWrapper({ program, exercises }: Props) {
  async function handleSave(data: CreateProgramInput, programId?: string) {
    if (programId) {
      return updateGlobalProgramAction(programId, data);
    }
    return createGlobalProgramAction(data);
  }

  return (
    <ProgramEditor
      program={program}
      exercises={exercises}
      onSave={handleSave}
      redirectTo="/admin/global-programs"
    />
  );
}
