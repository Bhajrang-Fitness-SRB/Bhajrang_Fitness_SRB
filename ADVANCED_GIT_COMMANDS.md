# Advanced Git Commands Guide

This guide covers advanced Git commands that will help you manage your repository more effectively. Learn how to use `git stash`, `git cherry-pick`, `git revert`, and `git reset` with practical examples.

---

## Table of Contents

1. [git stash](#git-stash)
2. [git cherry-pick](#git-cherry-pick)
3. [git revert](#git-revert)
4. [git reset](#git-reset)

---

## git stash

### Overview

`git stash` temporarily saves changes in your working directory without committing them. This is useful when you need to switch branches or pull updates but aren't ready to commit your current work.

### Basic Usage

```bash
# Stash current changes
git stash

# Stash with a descriptive message
git stash save "description of changes"

# List all stashed changes
git stash list

# Apply the most recent stash (doesn't remove it)
git stash apply

# Apply a specific stash by name
git stash apply stash@{0}

# Apply and remove the stash
git stash pop

# Remove a specific stash without applying
git stash drop stash@{0}

# Remove all stashes
git stash clear
```

### Practical Examples

#### Example 1: Switching branches with uncommitted work

```bash
# You're on feature-branch with uncommitted changes
git status
# On branch feature-branch
# Changes not staged for commit:
#   modified: src/index.js

# Stash your work
git stash save "WIP: authentication logic"

# Switch to another branch
git checkout main

# Return to feature-branch and restore your work
git checkout feature-branch
git stash pop
```

#### Example 2: Stashing specific files

```bash
# Stash only specific files
git stash push src/index.js src/utils.js -m "Save specific file changes"

# List stashes to verify
git stash list
# stash@{0}: On feature-branch: Save specific file changes

# Apply the stash
git stash apply stash@{0}
```

#### Example 3: Creating a branch from a stash

```bash
# Create a new branch from stashed changes
git stash branch new-feature-branch stash@{0}

# This creates a new branch and applies the stash automatically
```

---

## git cherry-pick

### Overview

`git cherry-pick` applies specific commits from one branch to another. It's useful when you want to apply individual commits without merging entire branches.

### Basic Usage

```bash
# Apply a single commit
git cherry-pick <commit-hash>

# Apply multiple commits
git cherry-pick <commit-hash-1> <commit-hash-2> <commit-hash-3>

# Apply a range of commits
git cherry-pick <start-commit>..<end-commit>

# Apply commits from another branch
git cherry-pick <branch-name>

# Continue after resolving conflicts
git cherry-pick --continue

# Abort the cherry-pick process
git cherry-pick --abort
```

### Practical Examples

#### Example 1: Applying a bug fix to multiple branches

```bash
# Assume you fixed a bug on develop branch (commit: abc1234)
# Now apply it to the main branch

git checkout main
git cherry-pick abc1234

# The commit is now applied to main
# Commit message and changes are preserved
```

#### Example 2: Applying a range of commits

```bash
# Apply commits from commit 5d3a9f2 to 8e7c2b1 (8e7c2b1 inclusive)
git cherry-pick 5d3a9f2..8e7c2b1

# View the commits
git log --oneline -n 5
# 8e7c2b1 Feature update
# 7f6e5d4 Styling improvements
# 6e5d4c3 Bug fix
# ... (original commits on main)
```

#### Example 3: Handling conflicts during cherry-pick

```bash
# Start cherry-pick
git cherry-pick abc1234

# Conflicts occur!
# CONFLICT (content): Merge conflict in src/App.js

# Edit the conflicted files
vim src/App.js

# Mark as resolved
git add src/App.js

# Continue the cherry-pick
git cherry-pick --continue

# If you want to abort instead
git cherry-pick --abort
```

#### Example 4: Cherry-picking commits from another branch

```bash
# List commits on feature-branch
git log feature-branch --oneline -n 5

# Cherry-pick specific commits to main
git checkout main
git cherry-pick 3a2b1c0
git cherry-pick 4b3c2d1

# Or cherry-pick all commits from feature-branch
git cherry-pick feature-branch
```

---

## git revert

### Overview

`git revert` creates a new commit that undoes the changes from a previous commit. Unlike `git reset`, it preserves the commit history, making it safer for shared branches.

### Basic Usage

```bash
# Revert a single commit
git revert <commit-hash>

# Revert multiple commits
git revert <commit-hash-1> <commit-hash-2>

# Revert a range of commits (reverse order, most recent first)
git revert <end-commit>..<start-commit>

# Revert without creating a commit (stageable)
git revert --no-commit <commit-hash>

# Abort a revert in progress
git revert --abort
```

### Practical Examples

#### Example 1: Simple revert of a bad commit

```bash
# View recent commits
git log --oneline -n 5
# 5a4b3c2 Broken feature
# 4a3b2c1 Previous working commit
# 3a2b1c0 Earlier commit

# Revert the broken commit
git revert 5a4b3c2

# A new commit is created that undoes the changes
# Commit message: "Revert 'Broken feature'"

# View the result
git log --oneline -n 3
# 6b5c4d3 Revert "Broken feature"
# 5a4b3c2 Broken feature
# 4a3b2c1 Previous working commit
```

#### Example 2: Revert without committing (review before committing)

```bash
# Stage the revert without committing
git revert --no-commit abc1234

# Review the changes
git diff --cached

# Modify if needed
git add .

# Commit with a custom message
git commit -m "Custom revert message with additional changes"
```

#### Example 3: Revert a range of commits

```bash
# Revert commits from the newest to oldest in a range
# (end-commit)..(start-commit) - note the order!

git log --oneline
# 9z8y7x6 Commit 4
# 8y7x6w5 Commit 3
# 7x6w5v4 Commit 2
# 6w5v4u3 Commit 1

# Revert commits 4, 3, and 2
git revert 9z8y7x6..6w5v4u3

# This creates three new commits, one for each revert
git log --oneline -n 7
# d0c1b2a Revert "Commit 4"
# c0b1a2z Revert "Commit 3"
# b0a1z9y Revert "Commit 2"
# 9z8y7x6 Commit 4
# ... (earlier commits)
```

#### Example 4: Handling conflicts during revert

```bash
# Start revert
git revert abc1234

# Conflicts occur
# CONFLICT (content): Merge conflict in src/components/Header.js

# Resolve conflicts manually
vim src/components/Header.js

# Add resolved files
git add src/components/Header.js

# Complete the revert
git revert --continue

# Or abort if needed
git revert --abort
```

---

## git reset

### Overview

`git reset` moves the HEAD pointer to a previous commit and can modify the staging area and working directory. There are three modes: `soft`, `mixed` (default), and `hard`.

### Reset Modes Explained

| Mode | HEAD | Index (Staging) | Working Directory |
|------|------|-----------------|-------------------|
| `--soft` | Moves | ✗ (No change) | ✗ (No change) |
| `--mixed` (default) | Moves | ✓ (Resets) | ✗ (No change) |
| `--hard` | Moves | ✓ (Resets) | ✓ (Resets) |

### Basic Usage

```bash
# Soft reset: Move HEAD only (changes stay staged)
git reset --soft <commit-hash>

# Mixed reset: Move HEAD and unstage changes (default)
git reset --mixed <commit-hash>
git reset <commit-hash>  # Same as --mixed

# Hard reset: Move HEAD, unstage, and discard changes
git reset --hard <commit-hash>

# Reset a specific file
git reset <commit-hash> -- <file-path>

# Reset n commits back
git reset --soft HEAD~1  # Reset 1 commit
git reset --hard HEAD~3  # Reset 3 commits
```

### Practical Examples

#### Example 1: Soft reset - undo last commit but keep changes staged

```bash
# You made a commit but want to amend it
git log --oneline -n 3
# abc1234 Wrong commit message
# def5678 Previous commit

# Soft reset to undo the commit (changes stay in index)
git reset --soft HEAD~1

# Status shows the changes are still staged
git status
# On branch main
# Changes to be committed:
#   modified: src/index.js

# You can modify and recommit
git add .
git commit -m "Correct commit message"
```

#### Example 2: Mixed reset - undo commit and unstage changes

```bash
# Changes are committed and staged
git log --oneline -n 1
# xyz9999 Added new feature

# Mixed reset (default)
git reset HEAD~1

# Changes are now unstaged but still in working directory
git status
# On branch main
# Changes not staged for commit:
#   modified: src/feature.js

# Review and re-stage selectively
git diff src/feature.js
git add src/feature.js
git commit -m "Added new feature (revised)"
```

#### Example 3: Hard reset - discard all changes

```bash
# WARNING: This is destructive!
# You have commits and changes you want to completely undo

git log --oneline -n 3
# aaa1111 Broken feature
# bbb2222 Previous good state

# Hard reset to remove the broken commit and all changes
git reset --hard bbb2222

# Your working directory is now at bbb2222
# All changes from aaa1111 are permanently discarded
git log --oneline -n 2
# bbb2222 Previous good state
```

#### Example 4: Reset a specific file

```bash
# You committed a file but want to unstage it
git status
# On branch main
# Changes to be committed:
#   modified: config.json
#   modified: src/index.js

# Reset only config.json
git reset HEAD config.json

# Now only index.js is staged
git status
# On branch main
# Changes to be committed:
#   modified: src/index.js
# Changes not staged for commit:
#   modified: config.json
```

#### Example 5: Reset to a commit from a long time ago

```bash
# Your repository has evolved but you want to go back
git log --oneline -n 10

# Hard reset to a commit from 5 changes ago
git reset --hard HEAD~5

# Verify the reset
git log --oneline -n 3
# All recent commits are removed from history
```

---

## Comparison Table

| Command | Purpose | Preserves History | Safe for Shared Branches | Use Case |
|---------|---------|-------------------|--------------------------|----------|
| `git stash` | Temporarily save changes | N/A (temp storage) | ✓ Yes | Switching branches, pulling updates |
| `git cherry-pick` | Apply specific commits | ✓ Yes | ✓ Yes | Applying fixes to multiple branches |
| `git revert` | Undo with new commit | ✓ Yes | ✓ Yes | Fixing public/shared commits |
| `git reset` | Move to previous state | ✗ No | ✗ Risky | Local branch cleanup, amending commits |

---

## Best Practices

1. **Use `git stash` when**: You need to switch branches but aren't ready to commit
2. **Use `git cherry-pick` when**: You need specific commits from another branch
3. **Use `git revert` when**: You need to undo changes on shared/public branches
4. **Use `git reset` when**: Working on local branches before pushing

---

## Safety Tips

- **Always backup**: Before using `git reset --hard`, ensure you have a backup
- **Use `git reflog`**: Recover commits if needed after a reset
- **Test first**: Use `--soft` or `--no-commit` to preview changes
- **Communicate**: Tell your team before force-pushing reset changes

---

## Additional Resources

- [Official Git Documentation](https://git-scm.com/doc)
- [Git Cherry-pick Guide](https://git-scm.com/docs/git-cherry-pick)
- [Understanding Git Revert](https://git-scm.com/docs/git-revert)
- [Git Reset Explained](https://git-scm.com/docs/git-reset)

---

**Last Updated**: 2026-08-04  
**Repository**: Bhajrang-Fitness-SRB/bhajrang-fitness-portal
