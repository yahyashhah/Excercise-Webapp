# Merge Templates & Template Library into One Tab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the three-tab layout (Programs / Templates / Template Library) into two tabs (Programs / Templates), where the merged Templates tab shows both clinician-owned templates (tagged "Clinical") and admin global programs (tagged "Global"), with a pill filter to switch between All / Clinical / Global.

**Architecture:** All changes are client-side in `program-list-client.tsx` plus a one-line cleanup in the server page. The server already fetches both `programs` (with `isTemplate: true` when `tab=templates`) and `globalPrograms` in parallel, so no API or service changes are needed. The merged tab introduces a `typeFilter` state that drives which subset of cards renders.

**Tech Stack:** Next.js App Router, React, Tailwind CSS, shadcn/ui (Badge, Button, Tabs)

---

## Files

| File | Change |
|------|--------|
| `app/(platform)/programs/page.tsx` | Remove the `library` branch from tab parsing |
| `components/programs/program-list-client.tsx` | Main work — merge tabs, add type filter, unified card grid |

---

### Task 1: Remove the `library` tab from the server page

**Files:**
- Modify: `app/(platform)/programs/page.tsx:18-23`

The server page currently parses `tab=library` as a valid value. Since the Library tab is being removed, drop that branch so only `"templates"` and `"programs"` are valid.

- [ ] **Step 1: Update tab parsing in the server page**

Open `app/(platform)/programs/page.tsx`. Replace lines 18–23:

```ts
// BEFORE
const tab =
  params.tab === "templates"
    ? "templates"
    : params.tab === "library"
    ? "library"
    : "programs";
```

With:

```ts
// AFTER
const tab =
  params.tab === "templates"
    ? "templates"
    : "programs";
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (or only pre-existing errors unrelated to this file).

---

### Task 2: Remove the "library" tab from the client tab bar and `activeTab` logic

**Files:**
- Modify: `components/programs/program-list-client.tsx`

- [ ] **Step 1: Update `activeTab` derivation (lines 115–122)**

Replace:

```ts
const activeTab =
  role === "CLINICIAN"
    ? searchParams.get("tab") === "templates"
      ? "templates"
      : searchParams.get("tab") === "library"
      ? "library"
      : "programs"
    : "programs";
```

With:

```ts
const activeTab =
  role === "CLINICIAN"
    ? searchParams.get("tab") === "templates"
      ? "templates"
      : "programs"
    : "programs";
```

- [ ] **Step 2: Shrink the Tabs from 3 columns to 2 (lines 179–193)**

Replace the entire Tabs block:

```tsx
{role === "CLINICIAN" && (
  <Tabs value={activeTab} onValueChange={handleTabChange}>
    <TabsList className="grid w-full max-w-md grid-cols-3">
      <TabsTrigger value="programs">Programs</TabsTrigger>
      <TabsTrigger value="templates">Templates</TabsTrigger>
      <TabsTrigger value="library">
        Template Library
        {globalPrograms.length > 0 && (
          <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
            {globalPrograms.length}
          </span>
        )}
      </TabsTrigger>
    </TabsList>
  </Tabs>
)}
```

With:

```tsx
{role === "CLINICIAN" && (
  <Tabs value={activeTab} onValueChange={handleTabChange}>
    <TabsList className="grid w-full max-w-xs grid-cols-2">
      <TabsTrigger value="programs">Programs</TabsTrigger>
      <TabsTrigger value="templates">Templates</TabsTrigger>
    </TabsList>
  </Tabs>
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

---

### Task 3: Add `typeFilter` state and pill filter UI

**Files:**
- Modify: `components/programs/program-list-client.tsx`

- [ ] **Step 1: Add `typeFilter` state**

After the existing `const [copying, setCopying] = useState<string | null>(null);` line, add:

```ts
const [typeFilter, setTypeFilter] = useState<"all" | "clinical" | "global">("all");
```

- [ ] **Step 2: Add the pill filter UI between the Tabs and the Toolbar**

Find the comment `{/* Toolbar */}` (currently around line 194). Insert the following block **before** that comment:

```tsx
{/* Type filter — only shown in Templates tab */}
{activeTab === "templates" && role === "CLINICIAN" && (
  <div className="flex items-center gap-2">
    {(["all", "clinical", "global"] as const).map((f) => (
      <button
        key={f}
        onClick={() => setTypeFilter(f)}
        className={[
          "rounded-full px-3 py-1 text-xs font-medium transition-colors",
          typeFilter === f
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:bg-muted/80",
        ].join(" ")}
      >
        {f === "all" ? "All" : f === "clinical" ? "Clinical" : "Global"}
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

---

### Task 4: Update the Toolbar to handle the merged Templates tab

**Files:**
- Modify: `components/programs/program-list-client.tsx`

Currently the toolbar is hidden on `library` tab with `activeTab !== "library"`. Since `library` no longer exists, the toolbar should always show on `programs` and `templates`, but the **Status filter** should hide when `typeFilter === "global"` (global programs have no status).

- [ ] **Step 1: Update toolbar visibility condition**

Find the Toolbar section (currently `{activeTab !== "library" && (`). Change the condition to simply always render the toolbar when not in a state we want to hide it — since library tab is gone, just keep it visible for both `programs` and `templates`:

```tsx
{/* Toolbar */}
<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
  <div className="flex flex-1 flex-wrap items-center gap-3">
    <div className="relative flex-1 min-w-48 max-w-sm">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder={activeTab === "templates" ? "Search templates..." : "Search programs..."}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="pl-9"
      />
    </div>
    {typeFilter !== "global" && (
      <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="DRAFT">Draft</SelectItem>
          <SelectItem value="ACTIVE">Active</SelectItem>
          <SelectItem value="PAUSED">Paused</SelectItem>
          <SelectItem value="COMPLETED">Completed</SelectItem>
        </SelectContent>
      </Select>
    )}
  </div>

  {role === "CLINICIAN" && (
    <div className="flex shrink-0 items-center gap-2">
      <Button variant="outline" className="gap-2" asChild>
        <Link href="/programs/upload">
          <Upload className="h-4 w-4 text-emerald-600" />
          Upload Brief
        </Link>
      </Button>
      <Button variant="outline" className="gap-2" asChild>
        <Link href="/programs/generate">
          <Sparkles className="h-4 w-4 text-blue-600" />
          AI Generate
        </Link>
      </Button>
      <Button className="gap-2 bg-linear-to-r from-blue-500 to-indigo-500 border-0 text-white shadow-md shadow-blue-500/20 hover:from-blue-600 hover:to-indigo-600" asChild>
        <Link href="/programs/new">
          <Plus className="h-4 w-4" />
          New Program
        </Link>
      </Button>
    </div>
  )}
</div>
```

Note: remove the surrounding `{activeTab !== "library" && ( ... )}` wrapper — the toolbar now always renders.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx tsc --noEmit 2>&1 | head -20
```

---

### Task 5: Build the unified card grid for the Templates tab

**Files:**
- Modify: `components/programs/program-list-client.tsx`

This is the main rendering change. Replace the old two separate grid sections (`activeTab !== "library"` grid + `activeTab === "library"` grid) with a unified grid that handles all three tab states.

- [ ] **Step 1: Compute filtered lists**

Find where `const filtered = programs.filter(...)` is defined (currently around line 135). Replace it with:

```ts
// Programs tab: non-template programs
const filteredPrograms = programs.filter((p) => {
  if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
  if (statusFilter !== "all" && p.status !== statusFilter) return false;
  return true;
});

// Templates tab — clinical subset
const filteredClinical =
  activeTab === "templates" && typeFilter !== "global"
    ? programs.filter((p) => {
        if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (typeFilter !== "global" && statusFilter !== "all" && p.status !== statusFilter) return false;
        return true;
      })
    : [];

// Templates tab — global subset
const filteredGlobal =
  activeTab === "templates" && typeFilter !== "clinical"
    ? globalPrograms.filter((p) => {
        if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
    : [];
```

- [ ] **Step 2: Replace the card grid sections**

Remove the two old blocks:
1. The block starting `{activeTab !== "library" && (filtered.length === 0 ? ...` (lines 247–381)
2. The block `{/* Template Library tab */}` (lines 383–434)

Replace with the following unified grid:

```tsx
{/* Programs tab grid */}
{activeTab === "programs" && (
  filteredPrograms.length === 0 ? (
    <div className="rounded-xl border border-dashed border-border p-12 text-center">
      <Library className="mx-auto h-12 w-12 text-muted-foreground/40" />
      <h3 className="mt-4 font-semibold">No programs found</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {role === "CLINICIAN"
          ? "Generate an AI program or create one manually to get started."
          : "No programs have been assigned to you yet."}
      </p>
      {role === "CLINICIAN" && (
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/programs/generate">
              <Sparkles className="mr-1.5 h-3.5 w-3.5 text-blue-600" />
              Generate with AI
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/programs/new">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Program
            </Link>
          </Button>
        </div>
      )}
    </div>
  ) : (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {filteredPrograms.map((program) => (
        <ProgramCard
          key={program.id}
          program={program}
          role={role}
          updatableSet={updatableSet}
          onDuplicate={handleDuplicate}
          onArchive={handleArchive}
          router={router}
        />
      ))}
    </div>
  )
)}

{/* Templates tab grid — merged clinical + global */}
{activeTab === "templates" && (
  filteredClinical.length === 0 && filteredGlobal.length === 0 ? (
    <div className="rounded-xl border border-dashed border-border p-12 text-center">
      <Library className="mx-auto h-12 w-12 text-muted-foreground/40" />
      <h3 className="mt-4 font-semibold">
        {typeFilter === "global"
          ? "No global templates"
          : typeFilter === "clinical"
          ? "No clinical templates"
          : "No templates found"}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {typeFilter === "global"
          ? "Your administrator hasn't added any global programs yet."
          : "Create a template or duplicate a program to build your library."}
      </p>
      {typeFilter !== "global" && role === "CLINICIAN" && (
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/programs/generate">
              <Sparkles className="mr-1.5 h-3.5 w-3.5 text-blue-600" />
              Generate with AI
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/programs/new">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Program
            </Link>
          </Button>
        </div>
      )}
    </div>
  ) : (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {filteredClinical.map((program) => (
        <ProgramCard
          key={program.id}
          program={program}
          role={role}
          updatableSet={updatableSet}
          onDuplicate={handleDuplicate}
          onArchive={handleArchive}
          router={router}
          typeBadge="clinical"
        />
      ))}
      {filteredGlobal.map((prog) => (
        <GlobalProgramCard
          key={prog.id}
          program={prog}
          copying={copying}
          onCopy={handleCopyGlobal}
        />
      ))}
    </div>
  )
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx tsc --noEmit 2>&1 | head -20
```

---

### Task 6: Extract `ProgramCard` and `GlobalProgramCard` sub-components

**Files:**
- Modify: `components/programs/program-list-client.tsx`

Extract the two card rendering patterns into local sub-components inside the same file (above the `ProgramListClient` export). This keeps the grid JSX clean and makes the badge additions easy.

- [ ] **Step 1: Add the `ProgramCard` component**

Add this above the `export function ProgramListClient` line:

```tsx
function ProgramCard({
  program,
  role,
  updatableSet,
  onDuplicate,
  onArchive,
  router,
  typeBadge,
}: {
  program: ProgramListItem;
  role?: string;
  updatableSet: Set<string>;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  router: ReturnType<typeof useRouter>;
  typeBadge?: "clinical";
}) {
  const status = statusConfig[program.status] ?? { label: program.status, className: "bg-muted text-muted-foreground border-border" };
  return (
    <Card className="group flex flex-col border-0 shadow-sm ring-1 ring-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:ring-border">
      <CardContent className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/programs/${program.id}`} className="flex-1 min-w-0">
            <h3 className="truncate text-base font-semibold leading-tight transition-colors group-hover:text-primary">
              {program.name}
            </h3>
          </Link>
          {role === "CLINICIAN" && (
            <DropdownMenu>
              <DropdownMenuTrigger className="shrink-0 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100">
                <MoreVertical className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => router.push(`/programs/${program.id}/edit`)}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate(program.id)}>
                  <Copy className="mr-2 h-4 w-4" /> Duplicate
                </DropdownMenuItem>
                {!program.patientId && (
                  <DropdownMenuItem onClick={() => router.push(`/programs/${program.id}?assign=true`)}>
                    <UserPlus className="mr-2 h-4 w-4" /> Assign Client
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onArchive(program.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Archive className="mr-2 h-4 w-4" /> Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Badge className={`border text-[11px] font-medium ${status.className}`}>
            {status.label}
          </Badge>
          {typeBadge === "clinical" && (
            <Badge className="border border-indigo-200 bg-indigo-50 text-[11px] font-medium text-indigo-700">
              Clinical
            </Badge>
          )}
          {program.isTemplate && !typeBadge && (
            <Badge variant="outline" className="text-[11px] font-medium">
              Template
            </Badge>
          )}
          {updatableSet.has(program.id) && (
            <Badge className="border border-amber-200 bg-amber-100 text-[11px] font-medium text-amber-700">
              Update available
            </Badge>
          )}
        </div>

        <div className="mt-4 flex-1 space-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {program.patient
                ? `${program.patient.firstName} ${program.patient.lastName}`
                : "Unassigned"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Dumbbell className="h-3.5 w-3.5 shrink-0" />
            <span>
              {program._count.workouts} workout{program._count.workouts !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        <div className="mt-4 border-t border-border/60 pt-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground/60">
              Updated {formatDistanceToNow(new Date(program.updatedAt), { addSuffix: true })}
            </p>
            <Link
              href={`/programs/${program.id}`}
              className="text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100"
            >
              View →
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Add the `GlobalProgramCard` component**

Add this immediately after `ProgramCard` (still above the `export function ProgramListClient` line):

```tsx
function GlobalProgramCard({
  program,
  copying,
  onCopy,
}: {
  program: GlobalProgramItem;
  copying: string | null;
  onCopy: (id: string, name: string) => void;
}) {
  return (
    <Card className="group flex flex-col border-0 shadow-sm ring-1 ring-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:ring-border">
      <CardContent className="flex flex-1 flex-col p-5">
        <div className="flex items-start gap-2">
          <Globe className="mt-0.5 h-4 w-4 shrink-0 text-primary/60" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold leading-tight">{program.name}</h3>
            {program.description && (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{program.description}</p>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Badge className="border border-violet-200 bg-violet-50 text-[11px] font-medium text-violet-700">
            Global
          </Badge>
          {program.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
          ))}
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          {program._count.workouts} workout{program._count.workouts !== 1 ? "s" : ""}
        </p>

        <div className="mt-4 border-t border-border/60 pt-3">
          <Button
            size="sm"
            className="w-full"
            disabled={copying === program.id}
            onClick={() => onCopy(program.id, program.name)}
          >
            {copying === program.id ? "Copying…" : "Copy to My Library"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

---

### Task 7: Final cleanup and verification

**Files:**
- Modify: `components/programs/program-list-client.tsx`

- [ ] **Step 1: Remove unused `programGradients` and `getProgramGradient`**

Check if `programGradients` / `getProgramGradient` are still referenced anywhere in the file:

```bash
grep -n "programGradients\|getProgramGradient" /Users/yahyashah/Dev/Excercise-Webapp/components/programs/program-list-client.tsx
```

If they are not used in any rendered JSX (they were unused even before this change), delete them.

- [ ] **Step 2: Remove the unused `Library` icon import if no longer referenced**

```bash
grep -n "Library" /Users/yahyashah/Dev/Excercise-Webapp/components/programs/program-list-client.tsx
```

Keep `Library` if it's still used in the empty state. Remove from the import if not.

- [ ] **Step 3: Full TypeScript check**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors vs. baseline.

- [ ] **Step 4: Smoke test in the browser**

Start the dev server if not already running:
```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npm run dev
```

Navigate to `/programs` and verify:
1. Only two tabs appear: **Programs** and **Templates**
2. Programs tab works exactly as before
3. Templates tab shows the pill filter: All / Clinical / Global
4. "All" shows both clinical templates and global programs
5. "Clinical" shows only own templates with the indigo "Clinical" badge
6. "Global" shows only global programs with the violet "Global" badge; Status dropdown is hidden
7. Search filters across whichever type(s) are visible
8. Clinical cards: Edit/Duplicate/Assign/Archive dropdown still works
9. Global cards: "Copy to My Library" button still works

---

## Summary of changes

| | Before | After |
|---|---|---|
| Tabs | Programs / Templates / Template Library | Programs / Templates |
| Templates tab content | Own templates only | Own templates + Global programs |
| Type filter | N/A | All / Clinical / Global pills |
| Clinical badge | "Template" (generic) | "Clinical" (indigo) |
| Global badge | Globe icon only | "Global" (violet) |
| Status filter | Always shown (except library) | Hidden when filter = Global |
