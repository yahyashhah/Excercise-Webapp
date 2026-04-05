const fs = require('fs');
const file = 'components/calendar/workout-editor-panel.tsx';
let code = fs.readFileSync(file, 'utf8');

// 1. Add Chevron icons
code = code.replace(/CalendarIcon }/, 'CalendarIcon, ChevronDown, ChevronRight, Settings }');

// 2. SortableExercise definition
const sortableRegex = /function SortableExercise\(\{[\s\S]*?className="h-3 w-3 mr-1" \/>\s*Add Set\s*<\/Button>\s*<\/div>\s*<\/div>\s*\);\s*\}/;

const newSortable = `function SortableExercise({
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

  return (
    <div ref={setNodeRef} style={style} className="py-2 border-b last:border-0 border-border group">                                                                   
      {/* Exercise header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 flex-1">
          <div
            {...attributes}
            {...listeners}
            className="cursor-move p-1 -ml-1 hover:bg-muted text-muted-foreground/40 rounded opacity-0 group-hover:opacity-100 transition-opacity"                                                                
          >
            <GripVertical className="h-4 w-4" />
          </div>
          
          <div className="flex items-center gap-2 flex-1">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-secondary text-secondary-foreground font-bold text-xs shrink-0 cursor-pointer" onClick={() => setExpanded(!expanded)}>
              {blockLetter}{exerciseIndex + 1}
            </div>
            
            <div className="flex flex-col flex-1 cursor-pointer" onClick={() => setExpanded(!expanded)}>
              <span className="font-semibold text-sm">
                {exercise.exercise.name}
              </span>
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
            className="text-muted-foreground hover:text-destructive h-6 w-6 lg:opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onDeleteExercise(blockIndex, exerciseIndex)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Sets & Notes Container (Collapsible) */}
      {expanded && (
        <div className="ml-[2.75rem] mt-3 pl-2 border-l-2 border-muted/50">
          <div className="mb-3">
            <Input
              placeholder="Add coach notes..."
              className="text-xs h-7 bg-transparent border-dashed border-muted focus:border-solid hover:border-solid shadow-none px-2"                                                                    
              value={exercise.notes || ""}
              onChange={(e) => onUpdateNotes(blockIndex, exerciseIndex, e.target.value)}                                                                            
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
            {exercise.sets.map((set: any, setIndex: number) => (
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
                <div className="flex flex-col gap-0.5">
                  <Input
                    type="number"
                    value={set.targetReps ?? ""}
                    onChange={(e) => onSetChange(blockIndex, exerciseIndex, setIndex, "targetReps", e.target.value)}                                                  
                    className="h-6 text-xs px-1.5 shadow-none border-transparent hover:border-border focus:border-ring focus-visible:ring-1"
                    placeholder="Reps"
                  />
                  <Input
                    type="number"
                    value={set.targetDuration ?? ""}
                    onChange={(e) => onSetChange(blockIndex, exerciseIndex, setIndex, "targetDuration", e.target.value)}                                              
                    className="h-6 text-[10px] px-1.5 text-muted-foreground bg-transparent shadow-none border-transparent hover:border-border focus:border-ring h-5 focus-visible:ring-1"
                    placeholder="Secs"
                  />
                </div>

                {/* Load & %1RM */}
                <div className="flex flex-col gap-0.5">
                  <Input
                    type="number"
                    value={set.targetWeight ?? ""}
                    onChange={(e) => onSetChange(blockIndex, exerciseIndex, setIndex, "targetWeight", e.target.value)}                                                
                    className="h-6 text-xs px-1.5 shadow-none border-transparent hover:border-border focus:border-ring focus-visible:ring-1"
                    placeholder="Lbs/Kg"
                  />
                  <Input
                    type="number"
                    value={set.targetPercentage1RM ?? ""}
                    onChange={(e) => onSetChange(blockIndex, exerciseIndex, setIndex, "targetPercentage1RM", e.target.value)}
                    className="h-6 text-[10px] px-1.5 text-muted-foreground bg-transparent shadow-none border-transparent hover:border-border focus:border-ring h-5 focus-visible:ring-1"
                    placeholder="% 1RM"
                  />
                </div>

                {/* Tempo & Rest */}
                <div className="flex flex-col gap-0.5">
                   <Input
                    type="text"
                    value={set.tempo ?? ""}
                    onChange={(e) => onSetChange(blockIndex, exerciseIndex, setIndex, "tempo", e.target.value)}
                    className="h-6 text-xs px-1.5 shadow-none border-transparent hover:border-border focus:border-ring focus-visible:ring-1"
                    placeholder="Tempo"
                  />
                  <Input
                    type="number"
                    value={set.restAfter ?? ""}
                    onChange={(e) => onSetChange(blockIndex, exerciseIndex, setIndex, "restAfter", e.target.value)}                                                   
                    className="h-6 text-[10px] px-1.5 text-muted-foreground bg-transparent shadow-none border-transparent hover:border-border focus:border-ring h-5 focus-visible:ring-1"
                    placeholder="Rest(s)"
                  />
                </div>

                {/* Delete Set */}
                <div className="flex justify-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive h-6 w-6 opacity-0 group-hover/set:opacity-100 transition-opacity"                                                                               
                    onClick={() => onDeleteSet(blockIndex, exerciseIndex, setIndex)}  
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground mt-2 text-xs h-7 px-2 hover:bg-secondary"
            onClick={() => onAddSet(blockIndex, exerciseIndex)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Set
          </Button>
        </div>
      )}
    </div>
  );
}`;

if(code.match(sortableRegex)) {
  code = code.replace(sortableRegex, newSortable);
  console.log("Replaced sortableRegex");
} else {
  console.log("Failed to match sortableRegex");
}

// 3. Blocks map
const blocksRegex = /\{session\.workout\.blocks\.map\(\(block, blockIndex\) => \{[\s\S]*?\{\/\* Add block \*\/\}/;

const newBlocks = `{session.workout.blocks.map((block, blockIndex) => {
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
                              className={\`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0 rounded-sm \${typeConfig.color}\`}
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
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">                         
                                  <Settings className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
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

                  {/* Add block */}`;

if(code.match(blocksRegex)) {
  code = code.replace(blocksRegex, newBlocks);
  console.log("Replaced blocksRegex");
} else {
  console.log("Failed to match blocksRegex");
}

// 4. Add block UI
const addBlockRegex = /\{addingBlockType \? \([\s\S]*?<\/Button>\s*\)\}/;
const newAddBlockUI = `{addingBlockType ? (
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
                              <div className={\`w-2 h-2 rounded-full mr-2 \${bt.color.split(' ')[0]}\`} />
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
                    )}`;
if(code.match(addBlockRegex)) {
  code = code.replace(addBlockRegex, newAddBlockUI);
  console.log("Replaced addBlockRegex");
} else {
  console.log("Failed to match addBlockRegex");
}

fs.writeFileSync(file, code);
console.log("Wrote to " + file);
