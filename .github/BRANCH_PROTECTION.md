# Branch Protection Recommendations

This document provides recommended branch protection rules for the `trakt.tv-mcp` repository.

## Main Branch Protection

To enable these rules, go to: **Settings → Branches → Add branch protection rule**

### Recommended Settings for `main` branch:

#### Protect matching branches
- **Branch name pattern:** `main`

#### Rules

1. **Require a pull request before merging**
   - ✅ Require approvals: 1
   - ✅ Dismiss stale pull request approvals when new commits are pushed
   - ✅ Require review from Code Owners (if CODEOWNERS file exists)

2. **Require status checks to pass before merging**
   - ✅ Require branches to be up to date before merging
   - **Required status checks:**
     - `Code Quality Checks (TypeScript Compilation)`
     - `Code Quality Checks (ESLint)`
     - `Code Quality Checks (Prettier Format Check)`
     - `Code Quality Checks (Tests)`
     - `All Checks Passed`

3. **Require conversation resolution before merging**
   - ✅ All conversations must be resolved before merging

4. **Require signed commits** (optional but recommended)
   - ✅ Require commits to be signed

5. **Require linear history** (optional)
   - ✅ Prevent merge commits (requires squash or rebase merging)

6. **Do not allow bypassing the above settings**
   - ✅ Include administrators

7. **Restrict who can push to matching branches** (optional)
   - Configure based on your team structure

8. **Allow force pushes**
   - ❌ Do not allow force pushes

9. **Allow deletions**
   - ❌ Do not allow deletion of the branch

## Phase Branch Protection (Optional)

For development branches like `phase-1-*`, `phase-2-*`, etc., you can apply lighter restrictions:

### Recommended Settings for `phase-*` branches:

- **Branch name pattern:** `phase-*`
- ✅ Require status checks to pass before merging
  - Required checks: All CI checks
- ✅ Require branches to be up to date before merging

## How to Apply These Rules

1. Go to your GitHub repository
2. Click **Settings** → **Branches**
3. Click **Add branch protection rule**
4. Enter the branch name pattern (e.g., `main`)
5. Select the checkboxes as outlined above
6. Click **Create** or **Save changes**

## Benefits

- **Code Quality:** All code must pass linting, formatting, type checking, and tests
- **Review Process:** Ensures code is reviewed before merging
- **History Integrity:** Prevents accidental force pushes and deletions
- **Security:** Prevents merging PRs with known security vulnerabilities
- **Consistency:** Enforces consistent coding standards across the team

## Additional Recommendations

1. **CODEOWNERS File:** Create a `.github/CODEOWNERS` file to automatically assign reviewers
2. **Pull Request Template:** Add `.github/pull_request_template.md` for consistent PR descriptions
3. **Issue Templates:** Add `.github/ISSUE_TEMPLATE/` for bug reports and feature requests
4. **Dependabot:** Enable Dependabot to automatically create PRs for dependency updates
5. **Security Policy:** Add `SECURITY.md` to document security vulnerability reporting process

## Testing Status Checks

Before enabling required status checks, verify they work by:

1. Creating a test branch
2. Making a small change
3. Pushing and creating a PR
4. Confirming all CI checks run and pass
5. Only then enable as required checks for `main`
