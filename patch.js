
const fs = require("fs");
const file = "components/calendar/workout-editor-panel.tsx";
let content = fs.readFileSync(file, "utf8");

const importLine = `import { getPatientExerciseHistory } from "@/actions/exercise-history-actions";\nimport { History } from "lucide-react";\n`;
content = content.replace(`import {`, `${importLine}import { `);

// Add patientId to SortableExercise
content = content.replace(/function SortableExercise\(\{([^)]+)\}/, "function SortableExercise({\n  $1,\n  patientId\n}");

// Add history state
const historyState = `
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
`;
content = content.replace(/(const style = \{[^}]+};\n)/, `$1\n${historyState}\n`);

// Add history button next to Delete
const historyButton = `
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-primary mr-1"
          onClick={loadHistory}
          title="View Exercise History"
        >
          <History className="h-3.5 w-3.5" />
        </Button>
`;
content = content.replace(/(<Button[^>]+variant="ghost"[^>]+onClick=\{\(\) => onDeleteExercise\([^)]+\)\}[^>]+>)/, `${historyButton}$1`);

// Add history flyout panel
const historyPanel = `
      {historyOpen && (
        <div className="ml-10 mb-3 p-3 bg-muted/30 rounded-md border text-xs">
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-semibold flex items-center"><History className="h-3 w-3 mr-1" /> Past Performance</h4>
            {historyLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          {!historyLoading && (!historyData || historyData.length === 0) ? (
            <p className="text-muted-foreground italic">No past history found for this exercise.</p>
          ) : !historyLoading && (
            <div className="space-y-3">
              {historyData.map((session: any) => (
                <div key={session.sessionId} className="border-b last:border-b-0 pb-2 last:pb-0">
                  <div className="text-muted-foreground mb-1 font-medium">
                    {new Date(session.scheduledDate).toLocaleDateString()} - <span className="text-primary/70">{session.status}</span>
                  </div>
                  {session.records.map((r: any, idx: number) => (
                    <div key={idx} className="space-y-1">
                      {Math.max(r.targetSets.length, r.actualSets.length) > 0 ? (
                         Array.from({ length: Math.max(r.targetSets.length, r.actualSets.length) }).map((_, sIdx) => {
                           const t = r.targetSets[sIdx];
                           const a = r.actualSets[sIdx];
                           return (
                             <div key={sIdx} className="grid grid-cols-[1rem_1fr_1fr] gap-2 pl-2">
                               <span className="text-muted-foreground">{sIdx + 1}.</span>
                               <span>Target: {t?.targetReps||"-"} reps {t?.targetWeight ? \`@ \${t.targetWeight}\` : ""}</span>
                               <span>Actual: {a?.actualReps||"-"} reps {a?.actualWeight ? \`@ \${a.actualWeight}\` : ""}</span>
                             </div>
                           );
                         })
                      ) : (
                        <p className="pl-2 italic text-muted-foreground">No sets logged.</p>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
`;
content = content.replace(/({?\/\* Sets table \*\/}?)/, `${historyPanel}\n      $1`);

content = content.replace(/(<SortableExercise[^]*?savingSetIds=\{savingSetIds\}[^]*?)/, `$1\n                                  patientId={patientId}`);

fs.writeFileSync(file, content);

