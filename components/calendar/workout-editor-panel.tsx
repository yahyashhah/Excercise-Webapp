import {  getPatientExerciseHistory } from "@/actions/exercise-history-actions";
import { History } from "lucide-react";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { GripVertical, Dumbbell, Trash2, Loader2, X, Plus, MoreVertical, Calendar as CalendarIcon, ChevronDown, ChevronRight, Settings, CheckCircle, Info, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format } from "date-fns";
import { UniversalVideoPlayer } from "@/components/exercises/universal-video-player";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ExercisePickerDialog } from "@/components/programs/exercise-picker-dialog";
import type { SessionWithFullWorkout } from "@/actions/calendar-workout-actions";                                                                               
import {
  getSessionWithWorkout,
  updateWorkoutName,
  addBlockToWorkout,
  addExerciseToBlock,
  addSetToExercise,
  updateSet,
  updateBlock,
  deleteSet,
  updateBlockExercise,
  reorderBlockExercises,
  deleteBlockExercise,
  deleteBlock,
  deleteSession,
} from "@/actions/calendar-workout-actions";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ---------------------------------------------------------------------------  // Types
// ---------------------------------------------------------------------------  

type ExerciseSummary = {
  id: string;
  name: string;
  bodyRegion: string;
  difficultyLevel: string;
  defaultReps?: number | null;
  targetRPE?: number | null;
  targetPercentage1RM?: number | null;
  tempo?: string | null;
  musclesTargeted?: string[];
  description?: string | null;
  videoUrl?: string | null;
  videoProvider?: string | null;
  exercisePhase?: string | null;
};

type PanelState =
  | { mode: "closed" }
  | { mode: "creating"; date: Date }
  | { mode: "editing"; sessionId: string };

interface WorkoutEditorPanelProps {
  panelState: PanelState;
  onClose: () => void;
  exerciseLibrary: ExerciseSummary[];
  patientId: string;
  onWorkoutCreated: () => void;
  onWorkoutDeleted: () => void;
  onWorkoutUpdated: () => void;
  onAiGenerateClick?: (date: Date) => void;
  createAdHocWorkoutAction: (
    patientId: string,
    scheduledDate: string,
    workoutName: string
  ) => Promise<{ success: true; data: { sessionId: string; workoutId: string } }
 | { success: false; error: string }>;                                          
}

// ---------------------------------------------------------------------------  // Block type config
// ---------------------------------------------------------------------------  

const BLOCK_TYPES = [
  { value: 'NORMAL', label: 'Normal', color: 'bg-gray-100 text-gray-700' },
  { value: 'WARMUP', label: 'Warmup', color: 'bg-green-100 text-green-700' },
  { value: 'COOLDOWN', label: 'Cooldown', color: 'bg-teal-100 text-teal-700' },
  { value: 'CIRCUIT', label: 'Circuit', color: 'bg-purple-100 text-purple-700' },
  { value: 'SUPERSET', label: 'Superset', color: 'bg-orange-100 text-orange-700' },
  { value: 'AMRAP', label: 'AMRAP', color: 'bg-red-100 text-red-700' },
  { value: 'EMOM', label: 'EMOM', color: 'bg-blue-100 text-blue-700' },
] as const;

function getBlockTypeConfig(type: string) {
  return BLOCK_TYPES.find((bt) => bt.value === type) ?? BLOCK_TYPES[0];
}

// ---------------------------------------------------------------------------  // Debounce hook for inline set editing
// ---------------------------------------------------------------------------  

function useDebouncedCallback<T extends (...args: never[]) => unknown>(
  callback: T,
  delay: number
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  );
}

// ---------------------------------------------------------------------------  // Sortable Exercise Item
// ---------------------------------------------------------------------------  
function SortableExercise({
  
  id,
  exercise,
  savingSetIds,
  blockIndex,
  exerciseIndex,
  blockLetter,
  isCircuit,
  onSetChange,
  onDeleteSet,
  onDeleteExercise,
  onAddSet,
  onUpdateNotes,
  patientId,
  sessionStatus,
  exerciseLog
}: any) {
  const [expanded, setExpanded] = React.useState(true);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };


  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyData, setHistoryData] = useState<any>(null);

  async function loadHistory() {
    if (historyOpen) {
      setHistoryOpen(false);
      return;
    }
    setHistoryLoading(true);
    setHistoryOpen(true);
    const res = await getPatientExerciseHistory(patientId, exercise.exercise.id);
    if (res.success) {
      setHistoryData(res.data);
    }
    setHistoryLoading(false);
  }


  return (
    <div ref={setNodeRef} style={style} className="py-2 border-b last:border-0 border-border group">                                                                   
      {/* Exercise header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 flex-1">
          <div
            {...attributes}
            {...listeners}
            className={`cursor-move p-1 -ml-1 ${sessionStatus === "COMPLETED" ? "opacity-0 cursor-default" : "hover:bg-muted text-muted-foreground/40 rounded opacity-0 group-hover:opacity-100 transition-opacity"}`}                                                                
          >
            <GripVertical className="h-4 w-4" />
          </div>
          
          <div className="flex items-center gap-2 flex-1">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-secondary text-secondary-foreground font-bold text-xs shrink-0 cursor-pointer" onClick={() => setExpanded(!expanded)}>
              {blockLetter}{exerciseIndex + 1}
            </div>

            <div className="flex flex-col flex-1 cursor-pointer min-w-0" onClick={() => setExpanded(!expanded)}>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm truncate">
                  {exercise.exercise.name}
                </span>
                {exercise.exercise.videoUrl && (
                  <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded-sm font-medium shrink-0">
                    Video
                  </span>
                )}
              </div>
              {(exercise.notes || isCircuit) && (
                <span className="text-xs text-muted-foreground line-clamp-1">
                   {isCircuit ? "Circuit/Superset" : ""} {exercise.notes && isCircuit ? " - " : ""}{exercise.notes}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-foreground h-6 w-6"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
          
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-primary mr-1"
          onClick={loadHistory}
          title="View Exercise History"
        >
          <History className="h-3.5 w-3.5" />
        </Button>
{(!sessionStatus || sessionStatus !== "COMPLETED") && (
<Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-destructive h-6 w-6 lg:opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onDeleteExercise(blockIndex, exerciseIndex)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
)}
        </div>
      </div>

      {/* Sets & Notes Container (Collapsible) */}
      {expanded && (
        <div className="ml-[2.75rem] mt-3 pl-2 border-l-2 border-muted/50">
          {exercise.exercise.videoUrl && (
            <div className="mb-3 w-full max-w-[280px] aspect-video rounded-md overflow-hidden bg-black/10">
              <UniversalVideoPlayer
                url={exercise.exercise.videoUrl}
                provider={exercise.exercise.videoProvider}
              />
            </div>
          )}
          <div className="mb-3">
            <Input
              placeholder="Add coach notes..."
              className="text-xs h-7 bg-transparent border-dashed border-muted focus:border-solid hover:border-solid shadow-none px-2 disabled:opacity-70 disabled:cursor-default disabled:border-transparent"                                                                    
              value={exercise.notes || ""}
              onChange={(e) => onUpdateNotes(blockIndex, exerciseIndex, e.target.value)}
              disabled={sessionStatus === "COMPLETED"}
            />
          </div>

          <div className="space-y-1">
            {/* Minimal Set Headers */}
            {exercise.sets.length > 0 && (
              <div className="grid grid-cols-[1.5rem_1.5fr_1.5fr_1fr_1.5rem] gap-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1 mb-1">                                        
                <span className="text-center">Set</span>
                <span>Reps / Dur</span>
                <span>Load / %</span>
                <span>Tempo/Rest</span>
                <span />
              </div>
            )}
            
            {/* Sets Rows */}
            {exercise.sets.map((set: any, setIndex: number) => {
              const actualLog = exerciseLog?.setLogs?.find((l: any) => l.setIndex === setIndex);
              const isCompleted = sessionStatus === "COMPLETED";

              return (
              <div
                key={set.id}
                className="grid grid-cols-[1.5rem_1.5fr_1.5fr_1fr_1.5rem] gap-2 items-center group/set border rounded-sm p-1 bg-background/50 hover:bg-accent/20 transition-colors"                                                                
              >
                <div className="text-xs font-medium text-muted-foreground text-center relative">                                                                               
                  {setIndex + 1}
                  {savingSetIds.has(set.id) && (
                    <Loader2 className="h-2.5 w-2.5 animate-spin absolute -right-1 -top-1 text-primary" />                                                      
                  )}
                </div>
                
                {/* Reps & Duration */}
                <div className="flex flex-col gap-0.5 relative">
                  <Input
                    type="number"
                    value={set.targetReps ?? ""}
                    onChange={(e) => onSetChange(blockIndex, exerciseIndex, setIndex, "targetReps", e.target.value)}                                                  
                    className="h-6 text-xs px-1.5 shadow-none border-transparent hover:border-border focus:border-ring focus-visible:ring-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Reps"
                    disabled={isCompleted}
                  />
                  <Input
                    type="number"
                    value={set.targetDuration ?? ""}
                    onChange={(e) => onSetChange(blockIndex, exerciseIndex, setIndex, "targetDuration", e.target.value)}                                              
                    className="h-6 text-[10px] px-1.5 text-muted-foreground bg-transparent shadow-none border-transparent hover:border-border focus:border-ring focus-visible:ring-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Secs"
                    disabled={isCompleted}
                  />
                  {isCompleted && actualLog && (actualLog.actualReps != null || actualLog.actualDuration != null) && (
                     <div className="absolute -right-2 -top-2 flex gap-0.5 z-10" title="Actual Performance">
                       <Badge variant="outline" className="px-1 py-0 h-4 text-[9px] bg-green-50 text-green-700 border-green-200 shadow-sm flex items-center gap-0.5">
                         <CheckCircle className="h-2.5 w-2.5" />
                         {actualLog.actualReps != null ? `${actualLog.actualReps}r` : ''}
                         {actualLog.actualReps != null && actualLog.actualDuration != null ? ' | ' : ''}
                         {actualLog.actualDuration != null ? `${actualLog.actualDuration}s` : ''}
                       </Badge>
                     </div>
                  )}
                </div>

                {/* Load & %1RM */}
                <div className="flex flex-col gap-0.5 relative">
                  <Input
                    type="number"
                    value={set.targetWeight ?? ""}
                    onChange={(e) => onSetChange(blockIndex, exerciseIndex, setIndex, "targetWeight", e.target.value)}                                                
                    className="h-6 text-xs px-1.5 shadow-none border-transparent hover:border-border focus:border-ring focus-visible:ring-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Lbs/Kg"
                    disabled={isCompleted}
                  />
                  <Input
                    type="number"
                    value={set.targetPercentage1RM ?? ""}
                    onChange={(e) => onSetChange(blockIndex, exerciseIndex, setIndex, "targetPercentage1RM", e.target.value)}
                    className="h-6 text-[10px] px-1.5 text-muted-foreground bg-transparent shadow-none border-transparent hover:border-border focus:border-ring focus-visible:ring-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="% 1RM"
                    disabled={isCompleted}
                  />
                  {isCompleted && actualLog && actualLog.actualWeight != null && (
                     <div className="absolute -right-2 -top-2 flex gap-0.5 z-10" title="Actual Weight">
                       <Badge variant="outline" className="px-1 py-0 h-4 text-[9px] bg-green-50 text-green-700 border-green-200 shadow-sm flex items-center gap-0.5">
                         <CheckCircle className="h-2.5 w-2.5" />
                         {actualLog.actualWeight}
                       </Badge>
                     </div>
                  )}
                </div>

                {/* Tempo & Rest */}
                <div className="flex flex-col gap-0.5 relative">
                   <Input
                    type="text"
                    value={set.tempo ?? ""}
                    onChange={(e) => onSetChange(blockIndex, exerciseIndex, setIndex, "tempo", e.target.value)}
                    className="h-6 text-xs px-1.5 shadow-none border-transparent hover:border-border focus:border-ring focus-visible:ring-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Tempo"
                    disabled={isCompleted}
                  />
                  <Input
                    type="number"
                    value={set.restAfter ?? ""}
                    onChange={(e) => onSetChange(blockIndex, exerciseIndex, setIndex, "restAfter", e.target.value)}                                                   
                    className="h-6 text-[10px] px-1.5 text-muted-foreground bg-transparent shadow-none border-transparent hover:border-border focus:border-ring focus-visible:ring-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Rest(s)"
                    disabled={isCompleted}
                  />
                </div>

                {/* Delete Set */}
                <div className="flex justify-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive h-6 w-6 opacity-0 group-hover/set:opacity-100 transition-opacity disabled:opacity-0"                                                                               
                    onClick={() => onDeleteSet(blockIndex, exerciseIndex, setIndex)}  
                    disabled={isCompleted}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )})}
          </div>
          
          {!sessionStatus || sessionStatus !== "COMPLETED" ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground mt-2 text-xs h-7 px-2 hover:bg-secondary"
              onClick={() => onAddSet(blockIndex, exerciseIndex)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Set
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
// ---------------------------------------------------------------------------  // Main Component
// ---------------------------------------------------------------------------  

export function WorkoutEditorPanel({
  panelState,
  onClose,
  exerciseLibrary,
  patientId,
  onWorkoutCreated,
  onWorkoutDeleted,
  onWorkoutUpdated,
  onAiGenerateClick,
  createAdHocWorkoutAction,
}: WorkoutEditorPanelProps) {
  const [session, setSession] = useState<SessionWithFullWorkout | null>(null);  
  const [loading, setLoading] = useState(false);
  const [workoutName, setWorkoutName] = useState("");
  const [nameChanged, setNameChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingSetIds, setSavingSetIds] = useState<Set<string>>(new Set());     
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerBlockId, setPickerBlockId] = useState<string | null>(null);      
  const [addingBlockType, setAddingBlockType] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),        
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const isOpen = panelState.mode !== "closed";

  // Load session data when opening in edit mode
  useEffect(() => {
    if (panelState.mode === "editing") {
      loadSession(panelState.sessionId);
    } else if (panelState.mode === "creating") {
      setSession(null);
      setWorkoutName("New Workout");
      setNameChanged(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelState.mode, panelState.mode === "editing" ? panelState.sessionId : null]);
  async function loadSession(sessionId: string) {
    setLoading(true);
    try {
      const result = await getSessionWithWorkout(sessionId);
      if (result.success) {
        setSession(result.data);
        setWorkoutName(result.data.workout.name);
        setNameChanged(false);
      } else {
        toast.error(result.error);
        onClose();
      }
    } finally {
      setLoading(false);
    }
  }

  // Create a new ad-hoc workout when in creating mode
  async function handleCreateWorkout() {
    if (panelState.mode !== "creating") return;
    setSaving(true);
    try {
      const result = await createAdHocWorkoutAction(
        patientId,
        panelState.date.toISOString(),
        workoutName
      );
      if (result.success) {
        toast.success("Workout created");
        onWorkoutCreated();
        // Load the newly created session to switch to edit mode
        await loadSession(result.data.sessionId);
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  // Save workout name
  async function handleSaveName() {
    if (!session || !nameChanged) return;
    setSaving(true);
    try {
      const result = await updateWorkoutName(session.workout.id, workoutName);  
      if (result.success) {
        setNameChanged(false);
        onWorkoutUpdated();
        toast.success("Workout name updated");
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  const debouncedUpdateNotes = useDebouncedCallback(
    async (blockExerciseId: string, notes: string) => {
      const result = await updateBlockExercise(blockExerciseId, { notes });     
      if (!result.success) {
        toast.error(result.error);
      }
    },
    800
  );

  function handleUpdateExerciseNotes(
    blockIndex: number,
    exerciseIndex: number,
    notes: string
  ) {
    if (!session) return;
    const updatedSession = { ...session };
    const blocks = [...updatedSession.workout.blocks];
    const block = { ...blocks[blockIndex] };
    const exercises = [...block.exercises];
    const exercise = { ...exercises[exerciseIndex], notes };
    exercises[exerciseIndex] = exercise;
    block.exercises = exercises;
    blocks[blockIndex] = block;
    updatedSession.workout = { ...updatedSession.workout, blocks };
    setSession(updatedSession);

    debouncedUpdateNotes(exercise.id, notes);
  }

  // Debounced set update
  const debouncedUpdateSet = useDebouncedCallback(
    async (
      setId: string,
      data: { targetReps?: number | null; targetWeight?: number | null; targetPercentage1RM?: number | null; targetDuration?: number | null; targetRPE?: number | null; tempo?: string | null; restAfter?: number | null; }
    ) => {
      setSavingSetIds((prev) => new Set(prev).add(setId));
      try {
        const result = await updateSet(setId, data);
        if (!result.success) {
          toast.error(result.error);
        }
      } finally {
        setSavingSetIds((prev) => {
          const next = new Set(prev);
          next.delete(setId);
          return next;
        });
      }
    },
    800
  );

  // Update local set data and trigger debounced save
  function handleSetChange(
    blockIndex: number,
    exerciseIndex: number,
    setIndex: number,
    field: string,
    value: string
  ) {
    if (!session) return;
    const numValue = value === "" ? null : Number(value);
    const updatedSession = { ...session };
    const blocks = [...updatedSession.workout.blocks];
    const block = { ...blocks[blockIndex] };
    const exercises = [...block.exercises];
    const exercise = { ...exercises[exerciseIndex] };
    const sets = [...exercise.sets];
    const targetSet = { ...sets[setIndex], [field]: numValue };
    sets[setIndex] = targetSet;
    exercise.sets = sets;
    exercises[exerciseIndex] = exercise;
    block.exercises = exercises;
    blocks[blockIndex] = block;
    updatedSession.workout = { ...updatedSession.workout, blocks };
    setSession(updatedSession);

    debouncedUpdateSet(targetSet.id, { [field]: numValue } as never);
  }

  // Add block
  async function handleAddBlock(type: string) {
    if (!session) return;
    setAddingBlockType(false);
    const orderIndex = session.workout.blocks.length;
    const result = await addBlockToWorkout(session.workout.id, {
      type,
      orderIndex,
    });
    if (result.success) {
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          workout: {
            ...prev.workout,
            blocks: [
              ...prev.workout.blocks,
              { ...result.data, exercises: [] },
            ],
          },
        };
      });
      onWorkoutUpdated();
    } else {
      toast.error(result.error);
    }
  }

  // Add exercise to block
  function handleOpenPicker(blockId: string) {
    setPickerBlockId(blockId);
    setPickerOpen(true);
  }

  async function handleExerciseSelected(
    ex: ExerciseSummary
  ) {
    if (!pickerBlockId || !session) return;
    setPickerOpen(false);
    const result = await addExerciseToBlock(
      pickerBlockId,
      ex.id,
      undefined,
      ex.defaultReps ?? undefined
    );
    if (result.success) {
      setSession((prev) => {
        if (!prev) return prev;
        const blocks = prev.workout.blocks.map((b) => {
          if (b.id === pickerBlockId) {
            return { ...b, exercises: [...b.exercises, result.data] };
          }
          return b;
        });
        return { ...prev, workout: { ...prev.workout, blocks } };
      });
      onWorkoutUpdated();
    } else {
      toast.error(result.error);
    }
    setPickerBlockId(null);
  }

  // Add set
  async function handleAddSet(blockIndex: number, exerciseIndex: number) {      
    if (!session) return;
    const exercise = session.workout.blocks[blockIndex].exercises[exerciseIndex];                                                                               
    const orderIndex = exercise.sets.length;
    const result = await addSetToExercise(exercise.id, orderIndex);
    if (result.success) {
      setSession((prev) => {
        if (!prev) return prev;
        const blocks = [...prev.workout.blocks];
        const block = { ...blocks[blockIndex] };
        const exercises = [...block.exercises];
        const ex = { ...exercises[exerciseIndex] };
        ex.sets = [...ex.sets, result.data];
        exercises[exerciseIndex] = ex;
        block.exercises = exercises;
        blocks[blockIndex] = block;
        return { ...prev, workout: { ...prev.workout, blocks } };
      });
    } else {
      toast.error(result.error);
    }
  }

  // Delete set
  async function handleDeleteSet(
    blockIndex: number,
    exerciseIndex: number,
    setIndex: number
  ) {
    if (!session) return;
    const setId = session.workout.blocks[blockIndex].exercises[exerciseIndex].sets[setIndex].id;                                                                
    const result = await deleteSet(setId);
    if (result.success) {
      setSession((prev) => {
        if (!prev) return prev;
        const blocks = [...prev.workout.blocks];
        const block = { ...blocks[blockIndex] };
        const exercises = [...block.exercises];
        const ex = { ...exercises[exerciseIndex] };
        ex.sets = ex.sets.filter((_, i) => i !== setIndex);
        exercises[exerciseIndex] = ex;
        block.exercises = exercises;
        blocks[blockIndex] = block;
        return { ...prev, workout: { ...prev.workout, blocks } };
      });
    } else {
      toast.error(result.error);
    }
  }

  // Delete exercise from block
  async function handleDeleteExercise(blockIndex: number, exerciseIndex: number)
 {                                                                              
    if (!session) return;
    const beId = session.workout.blocks[blockIndex].exercises[exerciseIndex].id;
    const result = await deleteBlockExercise(beId);
    if (result.success) {
      setSession((prev) => {
        if (!prev) return prev;
        const blocks = [...prev.workout.blocks];
        const block = { ...blocks[blockIndex] };
        block.exercises = block.exercises.filter((_, i) => i !== exerciseIndex);
        blocks[blockIndex] = block;
        return { ...prev, workout: { ...prev.workout, blocks } };
      });
      onWorkoutUpdated();
    } else {
      toast.error(result.error);
    }
  }

  // Delete block
  async function handleDeleteBlock(blockIndex: number) {
    if (!session) return;
    const blockId = session.workout.blocks[blockIndex].id;
    const result = await deleteBlock(blockId);
    if (result.success) {
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          workout: {
            ...prev.workout,
            blocks: prev.workout.blocks.filter((_, i) => i !== blockIndex),     
          },
        };
      });
      onWorkoutUpdated();
    } else {
      toast.error(result.error);
    }
  }

  // Reorder exercises
  async function handleDragEnd(event: DragEndEvent, blockIndex: number) {       
    if (!session) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const block = session.workout.blocks[blockIndex];
    const oldIndex = block.exercises.findIndex((ex) => ex.id === active.id);    
    const newIndex = block.exercises.findIndex((ex) => ex.id === over.id);      

    if (oldIndex !== -1 && newIndex !== -1) {
      const newExercises = arrayMove(block.exercises, oldIndex, newIndex);      

      // Update local state
      const updatedSession = { ...session };
      const blocks = [...updatedSession.workout.blocks];
      blocks[blockIndex] = { ...block, exercises: newExercises };
      updatedSession.workout = { ...updatedSession.workout, blocks };
      setSession(updatedSession);

      // Map to update objects
      const updates = newExercises.map((ex, index) => ({
        id: ex.id,
        orderIndex: index,
      }));

      // Await server update
      const result = await reorderBlockExercises(block.id, updates);
      if (!result.success) {
        toast.error(result.error);
        // Should revert state ideally, but a refresh could be forced if we wanted                                                                              
      } else {
        onWorkoutUpdated();
      }
    }
  }

  // Change block type
  async function handleChangeBlockType(blockIndex: number, newType: string) {   
    if (!session) return;
    const blockId = session.workout.blocks[blockIndex].id;
    const result = await updateBlock(blockId, { type: newType });
    if (result.success) {
      setSession((prev) => {
        if (!prev) return prev;
        const blocks = [...prev.workout.blocks];
        blocks[blockIndex] = {
          ...blocks[blockIndex],
          type: result.data.type,
          rounds: result.data.rounds,
          timeCap: result.data.timeCap,
        };
        return { ...prev, workout: { ...prev.workout, blocks } };
      });
    } else {
      toast.error(result.error);
    }
  }

  // Delete session
  async function handleDeleteSession() {
    if (!session) return;
    setDeleting(true);
    try {
      const result = await deleteSession(session.id);
      if (result.success) {
        toast.success("Workout deleted");
        onWorkoutDeleted();
        onClose();
      } else {
        toast.error(result.error);
      }
    } finally {
      setDeleting(false);
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open) onClose();
  }

  // ---------- Render ----------

  const dateLabel =
    panelState.mode === "creating"
      ? format(panelState.date, "EEEE, MMM d, yyyy")
      : session
        ? format(new Date(session.scheduledDate), "EEEE, MMM d, yyyy")
        : "";

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl md:max-w-3xl lg:max-w-4xl overflow-hidden flex flex-col p-0"                                                                         
          showCloseButton={false}
        >
          {/* Header */}
          <SheetHeader className="border-b px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <SheetTitle className="sr-only">
                  {panelState.mode === "creating" ? "Create Workout" : "Edit Workout"}                                                                          
                </SheetTitle>
                {panelState.mode === "creating" && !session ? (
                  <Input
                    value={workoutName}
                    onChange={(e) => setWorkoutName(e.target.value)}
                    placeholder="Workout name..."
                    className="text-lg font-semibold border-none px-0 focus-visible:ring-0 h-auto"                                                              
                  />
                ) : session ? (
                  <Input
                    value={workoutName}
                    onChange={(e) => {
                      setWorkoutName(e.target.value);
                      setNameChanged(true);
                    }}
                    onBlur={handleSaveName}
                    placeholder="Workout name..."
                    className="text-lg font-semibold border-none px-0 focus-visible:ring-0 h-auto"                                                              
                  />
                ) : null}
                <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">                                                                  
                  <CalendarIcon className="h-3.5 w-3.5" />
                  <span>{dateLabel}</span>
                  {session && (
                    <Badge
                      variant="secondary"
                      className={`ml-2 text-xs ${
                        session.status === "COMPLETED"
                          ? "bg-green-100 text-green-700"
                          : session.status === "IN_PROGRESS"
                            ? "bg-amber-100 text-amber-700"
                            : session.status === "MISSED"
                              ? "bg-red-100 text-red-700"
                              : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {session.status}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2">
                {session && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleDeleteSession}
                    disabled={deleting}
                    className="text-destructive hover:text-destructive"
                  >
                    {deleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" onClick={onClose}>       
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </SheetHeader>

          {/* Body */}
          <ScrollArea className="flex-1 overflow-y-auto">
            <div className="p-5 space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-20">        
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />                                                                            
                </div>
              ) : panelState.mode === "creating" && !session ? (
                /* Creating mode — choose manual or AI */
                <div className="py-10 space-y-6">
                  <p className="text-center text-sm text-muted-foreground">
                    How would you like to create a workout for {dateLabel}?
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    {/* Manual */}
                    <button
                      onClick={handleCreateWorkout}
                      disabled={saving || !workoutName.trim()}
                      className="group flex flex-col items-center gap-3 rounded-xl border-2 border-border bg-background p-6 text-left transition-all hover:border-blue-400 hover:bg-blue-50/50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600 group-hover:bg-blue-200 transition-colors">
                        {saving ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Plus className="h-5 w-5" />
                        )}
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-sm">Build Manually</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Pick exercises and build the session yourself
                        </p>
                      </div>
                    </button>

                    {/* AI Generate */}
                    <button
                      onClick={() => {
                        onClose();
                        onAiGenerateClick?.(
                          panelState.mode === "creating" ? panelState.date : new Date()
                        );
                      }}
                      className="group flex flex-col items-center gap-3 rounded-xl border-2 border-border bg-background p-6 text-left transition-all hover:border-violet-400 hover:bg-violet-50/50"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-violet-600 group-hover:bg-violet-200 transition-colors">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-sm">Generate with AI</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Let AI build a full program for this client
                        </p>
                      </div>
                    </button>
                  </div>
                </div>
              ) : session ? (
                /* Edit mode - show blocks & exercises */
                <>
                  {session.status === "COMPLETED" && (session.overallRPE !== null || session.overallNotes) && (
                    <div className="bg-green-50 border border-green-200 rounded-md p-4 text-sm text-green-800 mb-6">
                      <div className="flex items-center gap-2 font-semibold mb-1">
                        <CheckCircle className="h-4 w-4" />
                        Patient Feedback
                      </div>
                      <div className="grid gap-1">
                        {session.overallRPE !== null && (
                          <div>
                            <span className="font-medium text-green-900">Overall RPE:</span> {session.overallRPE}/10
                          </div>
                        )}
                        {session.overallNotes && (
                          <div>
                            <span className="font-medium text-green-900">Notes:</span> {session.overallNotes}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {session.workout.blocks.map((block, blockIndex) => {
                    const typeConfig = getBlockTypeConfig(block.type);
                    const blockLetter = String.fromCharCode(65 + blockIndex); // A, B, C...
                    const isCircuit = block.type === "CIRCUIT" || block.type === "SUPERSET";
                    return (
                      <div
                        key={block.id}
                        className="mb-6 relative"   
                      >
                        {/* Block header - Cleaner, Floating */}
                        <div className="flex items-center justify-between mb-2 pb-1 border-b border-muted">                                                      
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="secondary"
                              className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0 rounded-sm ${typeConfig.color}`}
                            >
                              {typeConfig.label}
                            </Badge>
                            {isCircuit && block.rounds > 1 && (  
                              <span className="text-xs font-semibold text-muted-foreground ml-1">  
                                {block.rounds} Rounds
                              </span>
                            )}
                            {block.name && (
                              <span className="text-sm font-medium text-muted-foreground">
                                - {block.name}
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-muted-foreground hover:text-primary px-2"
                              onClick={() => handleOpenPicker(block.id)}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              <span className="hidden sm:inline">Add Exercise</span>
                            </Button>

                            <DropdownMenu>
                              <DropdownMenuTrigger className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground"><Settings className="h-4 w-4" /></DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {BLOCK_TYPES.filter(
                                  (bt) => bt.value !== block.type
                                ).map((bt) => (
                                  <DropdownMenuItem
                                    key={bt.value}
                                    onClick={() =>
                                      handleChangeBlockType(blockIndex, bt.value) 
                                    }
                                  >
                                    Change to {bt.label}
                                  </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => handleDeleteBlock(blockIndex)}   
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />       
                                  Delete Block
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>

                        {/* Exercises in block */}
                        <div className="divide-y border border-transparent flex-1 mb-2">
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={(event) => handleDragEnd(event, blockIndex)}                                                                             
                          >
                            <SortableContext
                              items={block.exercises.map((ex) => ex.id)}        
                              strategy={verticalListSortingStrategy}
                            >
                              {block.exercises.map((exercise, exerciseIndex) => (                                                                               
                                <SortableExercise
                                  key={exercise.id}
                                  id={exercise.id}
                                  exercise={exercise}
                                  blockIndex={blockIndex}
                                  exerciseIndex={exerciseIndex}
                                  blockLetter={blockLetter}
                                  isCircuit={isCircuit}
                                  savingSetIds={savingSetIds}
                                  patientId={patientId}
                                  sessionStatus={session.status}
                                  exerciseLog={session.exerciseLogs?.find((l: any) => l.blockExerciseId === exercise.id)}
                                  onSetChange={handleSetChange}
                                  onDeleteSet={handleDeleteSet}
                                  onDeleteExercise={handleDeleteExercise}       
                                  onAddSet={handleAddSet}
                                  onUpdateNotes={handleUpdateExerciseNotes}     
                                />
                              ))}
                            </SortableContext>
                          </DndContext>
                        </div>
                      </div>
                    );
                  })}

                  {/* Add block */}
                  {addingBlockType ? (
                      <div className="bg-muted/30 rounded-lg border border-dashed p-4 flex flex-col gap-3">       
                        <p className="text-sm font-medium text-muted-foreground">Select Block Type:</p>                                                                             
                        <div className="flex flex-wrap gap-2">
                          {BLOCK_TYPES.map((bt) => (
                            <Button
                              key={bt.value}
                              variant="outline"
                              size="sm"
                              className="h-8"
                              onClick={() => handleAddBlock(bt.value)}
                            >
                              <div className={`w-2 h-2 rounded-full mr-2 ${bt.color.split(' ')[0]}`} />
                              {bt.label}
                            </Button>
                          ))}
                          <div className="flex-1" />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-muted-foreground hover:text-foreground"
                            onClick={() => setAddingBlockType(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        className="w-full border-dashed border-2 text-muted-foreground hover:text-primary hover:bg-primary/5 h-12"
                        onClick={() => setAddingBlockType(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add New Block
                      </Button>
                    )}
                </>
              ) : null}
            </div>
          </ScrollArea>

          {/* Footer */}
          {session && nameChanged && (
            <SheetFooter className="border-t">
              <Button
                onClick={handleSaveName}
                disabled={saving}
                className="w-full"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : null}
                Save Name
              </Button>
            </SheetFooter>
          )}
          <SheetDescription className="sr-only">
            Workout editor panel for creating and editing workout sessions      
          </SheetDescription>
        </SheetContent>
      </Sheet>

      {/* Exercise picker dialog */}
      <ExercisePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        exercises={exerciseLibrary}
        onSelect={handleExerciseSelected}
      />
    </>
  );
}



