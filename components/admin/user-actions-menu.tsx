"use client";

import { useState, useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MoreHorizontal, Archive, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  archiveUserAction,
  restoreUserAction,
  deleteUserAction,
} from "@/actions/admin-actions";

interface UserActionsMenuProps {
  userId: string;
  isActive: boolean;
  userName: string;
}

export function UserActionsMenu({ userId, isActive, userName }: UserActionsMenuProps) {
  const [isPending, startTransition] = useTransition();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  function handleArchive() {
    startTransition(async () => {
      const result = await archiveUserAction(userId);
      if (result.success) toast.success("User archived.");
      else toast.error("Failed to archive user.");
    });
  }

  function handleRestore() {
    startTransition(async () => {
      const result = await restoreUserAction(userId);
      if (result.success) toast.success("User restored.");
      else toast.error("Failed to restore user.");
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteUserAction(userId);
      if (result.success) toast.success("User permanently deleted.");
      else toast.error((result as { success: false; error: string }).error ?? "Failed to delete user.");
      setShowDeleteDialog(false);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          disabled={isPending}
          aria-label="User actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end" className="w-40">
          {isActive ? (
            <DropdownMenuItem
              onClick={handleArchive}
              className="gap-2 text-amber-600"
            >
              <Archive className="h-4 w-4" />
              Archive
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem onClick={handleRestore} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Restore
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                variant="destructive"
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={(open) => !open && setShowDeleteDialog(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {userName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the user and all their data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
