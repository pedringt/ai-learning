# GitHub promotion workflow across chats

Use this guide when a change needs to move from a working branch to `staging` or `main`, especially when continuing in a new chat.

## Start with the remote state

1. Open the repository named in the handoff. Read `CLAUDE.md`, `RELEASE.md`, and the relevant project status or handoff document.
2. Fetch the latest remote refs. Check `git status`, the current branch, `origin/main`, `origin/staging`, and open PRs before editing or merging.
3. Identify the exact commits and files intended for promotion. A long-lived `staging` branch may contain unrelated changes; do not merge all of staging just because it is the normal promotion path. Build a clean branch from the target when needed, and bring over only the authorized change set.
4. Preserve existing local edits. Never reset, stash, or overwrite a dirty worktree without understanding whose work it is.

## Verify before creating a PR

- Run the focused checks for the change and any repository-required CI checks.
- Confirm the promotion branch is based on the current target branch and its diff contains only the intended files.
- Record the branch name, base, head SHA, changed files, and test results in the handoff so another chat can continue without reconstructing the work.

## Publish using an available GitHub path

Local Git authentication and the connected GitHub integration are separate. A local command such as `git push` can fail with `could not read Username` even when GitHub access is available to the assistant.

When local push authentication is unavailable:

1. Use the connected GitHub repository tools to create a branch from the target ref.
2. Publish the verified file contents on that branch using the GitHub Contents or Git Data API tools. If using Git Data, create blobs for changed files, create a tree based on the target tree, create a commit whose parent is the target commit, then update the branch ref.
3. Fetch the resulting remote commit and compare its files/diff with the verified local candidate. Do not claim a push succeeded until GitHub confirms the ref and SHA.
4. Create a PR from that branch into the explicitly authorized target, then inspect the PR diff, required checks, and merge state.

If no authenticated GitHub integration is available, do not retry unauthenticated pushes or claim the change is merged. Leave a clean local branch and report the exact push/PR step that is blocked.

## Merge and confirm

- Merge only after the user has explicitly named `staging` or `main` for this promotion, and the PR is the intended scope.
- After merge, verify the remote target branch SHA and the PR's merged status. If the repository deploys from that branch, verify the relevant deployment and perform the documented smoke test.
- Update the durable project handoff with the merged SHA, PR link, checks, deployment status, and any remaining setup. Keep that note concise and factual.

## Handoff block for the next chat

Include this information whenever work is not fully merged:

```text
Repository:
Target branch/environment:
Working branch:
Base SHA:
Candidate head SHA:
Included scope/files:
Checks run and results:
Remote branch/PR URL:
Remaining blocker or next exact action:
```
