---
name: no-auto-commit
description: User does not want the agent to create git commits, even when a task plan explicitly lists a commit step
metadata:
  type: feedback
---

Do not run `git commit`. Make the code changes only and leave committing to the user.

**Why:** When executing a task plan that ended with a "Step 6: Commit" instruction, the user rejected the commit and said "no don't add commits just do the changes".

**How to apply:** Even when a task description or plan includes an explicit commit step, stop after making and verifying the file changes. Report what changed and let the user commit themselves. Still fine to run read-only git commands (status, diff) to review work.
