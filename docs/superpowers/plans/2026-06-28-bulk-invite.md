# Bulk Invite via CSV — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CSV bulk invite to both the trainer client invite dialog and the admin "By Organization" view.

**Architecture:** A shared `BulkInviteTab` component handles CSV upload → validation → preview → send → results. A single `bulkInviteAction` server action covers both the trainer path (derives org from session) and the admin path (accepts explicit `clerkOrgId`). The trainer's `AddClientDialog` gains a "Single / Bulk CSV" tab switcher; each trainer row in `TrainersWithClientsTable` gets a "Bulk Invite" button.

**Tech Stack:** Next.js App Router, Clerk (`clerkClient().organizations.createOrganizationInvitation`), PapaParse (already installed), Zod (already installed), shadcn/ui Tabs (already installed at `components/ui/tabs.tsx`).

## Global Constraints

- No new npm packages — PapaParse, Zod, and shadcn Tabs are already present.
- CSV format: single column with header `email`, one email per row.
- Invitations use `role: "org:member"` and `redirectUrl: process.env.NEXT_PUBLIC_APP_URL + "/onboarding/client"` (same as existing `inviteClientAction`).
- Invitations are sent sequentially (not in parallel) to avoid Clerk rate limits.
- Per-email errors from Clerk are captured and surfaced in the results table; the action itself never throws.
- No commits — user reviews and commits themselves.

---

### Task 1: CSV invite validator

**Files:**
- Create: `lib/validators/csv-invite.ts`

**Interfaces:**
- Produces:
  - `CsvRowError { row: number; column: string; message: string }`
  - `CsvInviteValidationResult { valid: string[]; errors: CsvRowError[] }`
  - `validateCsvInviteRows(rawRows: Record<string, string>[]): CsvInviteValidationResult`

- [ ] **Step 1: Create `lib/validators/csv-invite.ts`**

```ts
import { z } from "zod";

const emailRowSchema = z.object({
  email: z.string().trim().email("Must be a valid email address"),
});

export interface CsvRowError {
  row: number;
  column: string;
  message: string;
}

export interface CsvInviteValidationResult {
  valid: string[];
  errors: CsvRowError[];
}

export function validateCsvInviteRows(
  rawRows: Record<string, string>[]
): CsvInviteValidationResult {
  const valid: string[] = [];
  const errors: CsvRowError[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rawRows.length; i++) {
    const result = emailRowSchema.safeParse(rawRows[i]);
    if (result.success) {
      const email = result.data.email.toLowerCase();
      if (!seen.has(email)) {
        seen.add(email);
        valid.push(email);
      }
    } else {
      for (const issue of result.error.issues) {
        errors.push({
          row: i + 2, // +1 for 0-index, +1 because row 1 is the header
          column: String(issue.path[0] ?? "email"),
          message: issue.message,
        });
      }
    }
  }

  return { valid, errors };
}
```

- [ ] **Step 2: Verify the file parses cleanly**

Run: `npx tsc --noEmit`
Expected: No errors related to `lib/validators/csv-invite.ts`.

---

### Task 2: Bulk invite server action

**Files:**
- Create: `actions/bulk-invite-action.ts`

**Interfaces:**
- Consumes: `requireSuperAdmin` from `@/lib/current-user`, `clerkClient` from `@clerk/nextjs/server`, `prisma` from `@/lib/prisma`
- Produces:
  - `InviteEmailResult { email: string; success: boolean; error?: string }`
  - `BulkInviteActionResult` (union: `{ success: true; results: InviteEmailResult[] } | { success: false; error: string }`)
  - `bulkInviteAction(emails: string[], clerkOrgId?: string): Promise<BulkInviteActionResult>`

- [ ] **Step 1: Create `actions/bulk-invite-action.ts`**

```ts
"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/current-user";
import { revalidatePath } from "next/cache";

export interface InviteEmailResult {
  email: string;
  success: boolean;
  error?: string;
}

type BulkInviteActionResult =
  | { success: true; results: InviteEmailResult[] }
  | { success: false; error: string };

/**
 * Trainer path: omit clerkOrgId — org is derived from the caller's DB user.
 * Admin path: pass clerkOrgId explicitly — caller must be super admin
 *   (requireSuperAdmin redirects if not, so this never returns an error in that case).
 */
export async function bulkInviteAction(
  emails: string[],
  clerkOrgId?: string
): Promise<BulkInviteActionResult> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  let orgId: string;
  let isAdmin = false;

  if (clerkOrgId) {
    await requireSuperAdmin(); // redirects if not authorized
    orgId = clerkOrgId;
    isAdmin = true;
  } else {
    const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!dbUser) return { success: false, error: "User not found" };
    if (dbUser.role !== "TRAINER") return { success: false, error: "Forbidden" };
    if (!dbUser.clerkOrgId) return { success: false, error: "Organization not set up" };
    orgId = dbUser.clerkOrgId;
  }

  const client = await clerkClient();
  const results: InviteEmailResult[] = [];

  for (const email of emails) {
    try {
      await client.organizations.createOrganizationInvitation({
        organizationId: orgId,
        inviterUserId: userId,
        emailAddress: email,
        role: "org:member",
        redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/client`,
      });
      results.push({ email, success: true });
    } catch (err: unknown) {
      let message = "Failed to send invitation";
      if (err && typeof err === "object" && "errors" in err) {
        const clerkErrors = (err as { errors: Array<{ message: string; longMessage?: string }> }).errors;
        message = clerkErrors.map((e) => e.longMessage ?? e.message).join("; ");
      } else if (err instanceof Error) {
        message = err.message;
      }
      results.push({ email, success: false, error: message });
    }
  }

  revalidatePath(isAdmin ? "/admin/users" : "/clients");
  return { success: true, results };
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors related to `actions/bulk-invite-action.ts`.

---

### Task 3: CSV invite template

**Files:**
- Create: `public/invite-template.csv`

- [ ] **Step 1: Create `public/invite-template.csv`**

File contents (exactly two lines):
```
email
example@yourcompany.com
```

- [ ] **Step 2: Verify it's accessible**

Run the dev server (`npm run dev`) and open `http://localhost:3000/invite-template.csv` in a browser.
Expected: The browser downloads or displays the CSV file.

---

### Task 4: Shared BulkInviteTab component

**Files:**
- Create: `components/shared/bulk-invite-tab.tsx`

**Interfaces:**
- Consumes:
  - `validateCsvInviteRows` from `@/lib/validators/csv-invite`
  - `InviteEmailResult` from `@/actions/bulk-invite-action`
- Produces:
  - `BulkInviteTab({ onInvite, onDone }: { onInvite: (emails: string[]) => Promise<InviteEmailResult[]>; onDone?: () => void })` — default export

- [ ] **Step 1: Create `components/shared/bulk-invite-tab.tsx`**

```tsx
"use client";

import { useRef, useState, useCallback } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  UploadCloud,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Download,
  X,
  Mail,
} from "lucide-react";
import { validateCsvInviteRows, type CsvRowError } from "@/lib/validators/csv-invite";
import type { InviteEmailResult } from "@/actions/bulk-invite-action";

type TabState = "idle" | "errors" | "preview" | "sending" | "results";

interface Props {
  onInvite: (emails: string[]) => Promise<InviteEmailResult[]>;
  onDone?: () => void;
}

export function BulkInviteTab({ onInvite, onDone }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<TabState>("idle");
  const [fileName, setFileName] = useState("");
  const [errors, setErrors] = useState<CsvRowError[]>([]);
  const [validEmails, setValidEmails] = useState<string[]>([]);
  const [results, setResults] = useState<InviteEmailResult[]>([]);

  const reset = useCallback(() => {
    setState("idle");
    setFileName("");
    setErrors([]);
    setValidEmails([]);
    setResults([]);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a .csv file");
      return;
    }
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim().toLowerCase(),
        transform: (v) => v.trim(),
      });

      if (parsed.data.length === 0) {
        toast.error("CSV has no data rows");
        return;
      }

      const result = validateCsvInviteRows(parsed.data);

      if (result.errors.length > 0) {
        setErrors(result.errors);
        setValidEmails([]);
        setState("errors");
      } else {
        setErrors([]);
        setValidEmails(result.valid);
        setState("preview");
      }
    };
    reader.readAsText(file);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleSend = useCallback(async () => {
    setState("sending");
    const inviteResults = await onInvite(validEmails);
    setResults(inviteResults);
    setState("results");
    const succeeded = inviteResults.filter((r) => r.success).length;
    if (succeeded > 0) {
      toast.success(
        `${succeeded} invitation${succeeded === 1 ? "" : "s"} sent`
      );
    }
  }, [validEmails, onInvite]);

  return (
    <div className="space-y-4">
      {/* Template download */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            Download the CSV template
          </p>
          <p className="text-xs text-muted-foreground">
            One email per row, single column.
          </p>
        </div>
        <a
          href="/invite-template.csv"
          download
          className="inline-flex items-center gap-1.5 rounded-lg bg-background px-3 py-1.5 text-sm font-medium text-foreground ring-1 ring-border hover:bg-muted transition-colors"
        >
          <Download className="h-4 w-4" />
          Template
        </a>
      </div>

      {/* Upload area */}
      {state === "idle" && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/20 px-8 py-12 text-center hover:border-primary/40 hover:bg-muted/40 transition-colors"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <UploadCloud className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground">
              Drop your CSV here, or click to browse
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              .csv files only · one email per row
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleInputChange}
          />
        </div>
      )}

      {/* Error state */}
      {state === "errors" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <p className="font-medium text-foreground">
                {errors.length} error{errors.length === 1 ? "" : "s"} found in{" "}
                <span className="text-muted-foreground">{fileName}</span>
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              <X className="h-4 w-4 mr-1" />
              Try again
            </Button>
          </div>
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-destructive/20">
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Row
                    </th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Error
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-destructive/10">
                  {errors.map((err, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                        {err.row}
                      </td>
                      <td className="px-4 py-2 text-xs text-foreground">
                        {err.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Fix these errors and upload again. Nothing has been sent.
          </p>
        </div>
      )}

      {/* Preview state */}
      {(state === "preview" || state === "sending") && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <p className="font-medium text-foreground">
                <span className="text-emerald-600">
                  {validEmails.length} email
                  {validEmails.length === 1 ? "" : "s"}
                </span>{" "}
                ready to invite from{" "}
                <span className="text-muted-foreground">{fileName}</span>
              </p>
            </div>
            {state === "preview" && (
              <Button variant="ghost" size="sm" onClick={reset}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            )}
          </div>
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="border-b border-border px-4 py-2.5 flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                Preview — first {Math.min(5, validEmails.length)} of{" "}
                {validEmails.length} email
                {validEmails.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="divide-y divide-border">
              {validEmails.slice(0, 5).map((email, i) => (
                <div key={i} className="flex items-center gap-2 px-4 py-2.5">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-sm text-foreground">{email}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            {state === "preview" ? (
              <Button onClick={handleSend} className="min-w-44">
                Send {validEmails.length} Invitation
                {validEmails.length !== 1 ? "s" : ""}
              </Button>
            ) : (
              <Button disabled className="min-w-44">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending…
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Results state */}
      {state === "results" && (
        <div className="space-y-4">
          <p className="font-medium text-foreground">
            <span className="text-emerald-600">
              {results.filter((r) => r.success).length} sent
            </span>
            {results.some((r) => !r.success) && (
              <>
                {" · "}
                <span className="text-destructive">
                  {results.filter((r) => !r.success).length} failed
                </span>
              </>
            )}
          </p>
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto max-h-56 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Email
                    </th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {results.map((r, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-xs text-foreground">
                        {r.email}
                      </td>
                      <td className="px-4 py-2">
                        {r.success ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{" "}
                            Sent
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-xs text-destructive"
                            title={r.error}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-destructive" />{" "}
                            Failed
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={reset}>
              Invite more
            </Button>
            <Button onClick={onDone}>Done</Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors related to `components/shared/bulk-invite-tab.tsx`.

---

### Task 5: Update AddClientDialog (trainer flow)

**Files:**
- Modify: `components/clients/add-client-dialog.tsx`

**Interfaces:**
- Consumes:
  - `BulkInviteTab` from `@/components/shared/bulk-invite-tab`
  - `bulkInviteAction, InviteEmailResult` from `@/actions/bulk-invite-action`
  - `Tabs, TabsContent, TabsList, TabsTrigger` from `@/components/ui/tabs`

- [ ] **Step 1: Replace the entire contents of `components/clients/add-client-dialog.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { inviteClientAction } from "@/actions/invite-client-action";
import { bulkInviteAction, type InviteEmailResult } from "@/actions/bulk-invite-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BulkInviteTab } from "@/components/shared/bulk-invite-tab";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";

export function AddClientDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = email.trim();
    if (!trimmed) {
      toast.error("Please enter a client email address");
      return;
    }

    startTransition(async () => {
      const result = await inviteClientAction(trimmed);

      if (result.success) {
        toast.success(
          "Invitation sent! The client will receive an email to join your organization."
        );
        setEmail("");
        setOpen(false);
      } else {
        toast.error(result.error ?? "Failed to send invitation");
      }
    });
  }

  async function handleBulkInvite(emails: string[]): Promise<InviteEmailResult[]> {
    const result = await bulkInviteAction(emails);
    if (!result.success) {
      toast.error(result.error ?? "Bulk invite failed");
      return emails.map((e) => ({ email: e, success: false, error: result.error }));
    }
    return result.results;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-all outline-none select-none hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 h-8">
        <UserPlus className="h-4 w-4" />
        Invite Client
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite Clients</DialogTitle>
          <DialogDescription>
            Invite one client by email, or upload a CSV to invite many at once.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="single" className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="single" className="flex-1">
              Single
            </TabsTrigger>
            <TabsTrigger value="bulk" className="flex-1">
              Bulk CSV
            </TabsTrigger>
          </TabsList>
          <TabsContent value="single">
            <form onSubmit={handleSubmit}>
              <div className="mt-4 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="client-email">Client Email</Label>
                  <Input
                    id="client-email"
                    type="email"
                    placeholder="client@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    disabled={isPending}
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button type="submit" disabled={isPending || !email.trim()}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send Invitation
                </Button>
              </div>
            </form>
          </TabsContent>
          <TabsContent value="bulk" className="mt-4">
            <BulkInviteTab
              onInvite={handleBulkInvite}
              onDone={() => setOpen(false)}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors.

---

### Task 6: Admin bulk invite dialog

**Files:**
- Create: `components/admin/admin-bulk-invite-dialog.tsx`

**Interfaces:**
- Consumes:
  - `BulkInviteTab` from `@/components/shared/bulk-invite-tab`
  - `bulkInviteAction, InviteEmailResult` from `@/actions/bulk-invite-action`
- Produces:
  - `AdminBulkInviteDialog({ clerkOrgId, trainerName }: { clerkOrgId: string; trainerName: string })`

- [ ] **Step 1: Create `components/admin/admin-bulk-invite-dialog.tsx`**

```tsx
"use client";

import { useState } from "react";
import { bulkInviteAction, type InviteEmailResult } from "@/actions/bulk-invite-action";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BulkInviteTab } from "@/components/shared/bulk-invite-tab";
import { toast } from "sonner";
import { Upload } from "lucide-react";

interface Props {
  clerkOrgId: string;
  trainerName: string;
}

export function AdminBulkInviteDialog({ clerkOrgId, trainerName }: Props) {
  const [open, setOpen] = useState(false);

  async function handleBulkInvite(emails: string[]): Promise<InviteEmailResult[]> {
    const result = await bulkInviteAction(emails, clerkOrgId);
    if (!result.success) {
      toast.error(result.error ?? "Bulk invite failed");
      return emails.map((e) => ({ email: e, success: false, error: result.error }));
    }
    return result.results;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-7 px-2">
          <Upload className="h-3.5 w-3.5" />
          Bulk Invite
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Invite Clients</DialogTitle>
          <DialogDescription>
            Upload a CSV of emails to invite clients into {trainerName}&apos;s
            organization.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2">
          <BulkInviteTab
            onInvite={handleBulkInvite}
            onDone={() => setOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors.

---

### Task 7: Wire AdminBulkInviteDialog into TrainersWithClientsTable

**Files:**
- Modify: `components/admin/trainers-with-clients-table.tsx`

The trainer row's last `<td>` currently has only `<UserActionsMenu>`. We add `<AdminBulkInviteDialog>` next to it, shown only when `trainer.clerkOrgId` is non-null.

- [ ] **Step 1: Add import at the top of `trainers-with-clients-table.tsx`**

After the existing imports, add:
```tsx
import { AdminBulkInviteDialog } from "@/components/admin/admin-bulk-invite-dialog";
```

- [ ] **Step 2: Replace the trainer row's last `<td>` (currently at line ~111-117)**

Find this block (the trainer row's action cell):
```tsx
                <td className="px-5 py-3 text-right">
                  <UserActionsMenu
                    userId={trainer.id}
                    isActive={trainer.isActive}
                    userName={`${trainer.firstName} ${trainer.lastName}`}
                  />
                </td>
```

Replace with:
```tsx
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {trainer.clerkOrgId && (
                      <AdminBulkInviteDialog
                        clerkOrgId={trainer.clerkOrgId}
                        trainerName={`${trainer.firstName} ${trainer.lastName}`}
                      />
                    )}
                    <UserActionsMenu
                      userId={trainer.id}
                      isActive={trainer.isActive}
                      userName={`${trainer.firstName} ${trainer.lastName}`}
                    />
                  </div>
                </td>
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors.

---

### Task 8: Manual smoke test

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Test trainer flow**

1. Sign in as a trainer.
2. Go to `/clients`.
3. Click "Invite Client" — dialog should now show "Single" and "Bulk CSV" tabs.
4. Switch to "Bulk CSV" tab.
5. Download the template, fill in 2–3 test emails, save as CSV.
6. Upload the CSV — preview table should show the emails.
7. Click "Send X Invitations" — results table should show per-email status.
8. Click "Done" — dialog closes.
9. Switch back to "Single" tab — existing invite form should still work normally.

- [ ] **Step 3: Test admin flow**

1. Sign in as super admin.
2. Go to `/admin/users?view=orgs`.
3. Each trainer row should show a "Bulk Invite" button to the left of the actions menu (only for trainers with an org).
4. Click "Bulk Invite" on a trainer row — dialog opens with that trainer's name in the description.
5. Upload the same test CSV — preview and results should work the same as trainer flow.

- [ ] **Step 4: Test CSV validation**

1. Upload a CSV with an invalid email (e.g. `notanemail`) — error table should appear, nothing sent.
2. Upload a CSV missing the `email` header column — error table should appear.
3. Upload a CSV with duplicate emails — duplicates should be deduplicated in the preview (only unique emails sent).
