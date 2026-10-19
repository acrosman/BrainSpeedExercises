---
name: fix-issue
description: Resolve a GitHub issue end to end — read it, plan, implement, test, and open a PR. Use when the user runs /fix-issue <number>.
argument-hint: <issue-number>
disable-model-invocation: false
allowed-tools: Bash(gh issue view:*), Bash(gh issue comment:*), Bash(gh pr create:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git checkout:*), Bash(git switch:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*)
---

# Resolve GitHub issue #$ARGUMENTS

## 0. Preconditions
- If no issue number was given, stop and ask for one.
- Run `git status`. If the working tree is dirty, stop and ask how to proceed — never stash or discard my changes.
- Make sure you are on the default branch and up to date (`git switch main && git pull`).

## 1. Understand the issue
- Run `gh issue view $ARGUMENTS --comments` and read the title, body, labels, and every comment.
- Restate the problem in 2–3 sentences, plus the acceptance criteria (explicit or implied).
- If the issue is ambiguous, contradictory, or looks like it needs a design decision, STOP and ask me before writing code.

## 2. Investigate
- Find the relevant code before changing anything. Reproduce the bug, adding a failing test is ideal, or confirm where the feature belongs.
- Note any related issues/PRs the issue mentions.

## 3. Plan
- Present a short plan: files to touch, approach, tests to add, and any risks.
- If there are additional bugs you notice while planning ask if you should include them in the work or open new issues to resolve them.

## 4. Implement
- Create a branch: `fix/$ARGUMENTS-<short-slug>` (use `feat/` for new features).
- Keep the change minimal and scoped to this issue. No drive-by refactors or reformatting of untouched code. If there are additional concerns you notice while working ask if you should include them in the work or open new issues to resolve them.

## 5. Verify
- Add or update tests that would have caught the issue.
- Run the full test suite, linter, and type checker. Fix anything you broke.
- Do not delete, skip, or weaken existing tests to make them pass. If one seems wrong, tell me and ask for instructions.

## 6. Commit and open a PR
- Commit with a clear message ending in `Fixes #$ARGUMENTS`.
- Push the branch and open a PR with `gh pr create`. PR body: summary, what changed and why, how it was tested, and anything reviewers should look at closely. Keep it short.
- Never push to main, force-push, or merge the PR yourself.

## 7. Report back
- Give me the PR link, a 3–5 line summary, and any follow-ups or open questions.
