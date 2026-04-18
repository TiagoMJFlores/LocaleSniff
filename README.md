# LocaleSniff

## The problem

Every team has the story: QA opens the app in French the day before release and there's a button still saying "Continue" in English. A hardcoded string slipped through two weeks ago, nobody caught it, and now the release is on hold while someone finds the string, writes six translations, and goes back through review.

The fix itself is trivial. Everything around it (re-cutting the build, re-testing, the schedule slip) is not. And it keeps happening, because a hardcoded string doesn't break the build and doesn't stand out in a diff.

LocaleSniff takes a git diff (anything `git diff` can produce: a branch vs `main`, the last commit, the last two weeks of activity) and flags hardcoded user-facing strings inside the added lines.

It's built for Jenkins. Two natural places to run it:

- **Before merge**: on a PR branch against `main`, fail the build if new hardcoded strings were added.
- **Before release**: in the release pipeline, diff against the last release tag and block the cut if anything slipped through.

The tool doesn't care which one you use, and both can coexist. You can also run it locally on a branch you're reviewing.

## What it does

Runs on your mobile codebase (iOS Swift/Obj-C, Android Kotlin/Java/XML) and scans git diffs for hardcoded user-facing strings. By default it just tells you what it found; pass `--recommend` and it also suggests:

- a key name that fits your project's existing naming convention
- translations for every locale your project already supports
- exactly which locale file to edit, and where in that file to insert the new entry (next to related keys, not at the bottom)

If the string you just hardcoded is something that already exists somewhere else in your locale files, LocaleSniff will spot that too and offer the reuse option instead of a fresh key.

## How it works

The detection is LLM-based (Claude), not AST-based. This makes the tool framework-agnostic (SwiftUI, UIKit, Compose, old XML layouts, it doesn't matter) and lets it make judgement calls like "this `print` call is a debug log, not a user message".

Results are cached per file and per prompt version, so re-running against the same diff is effectively free.

## Quick start

```bash
npm install
npm run build
npm link

# set your API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# scan the last commit (just see what's there)
localesniff scan --since=HEAD~1

# scan a PR branch with suggested keys + translations
localesniff scan --since=origin/main --recommend

# scan the last week of activity, skip test files
localesniff scan --window=1w --ignore "**/*Tests*/**" --ignore "**/*Spec.swift"
```

## Flags worth knowing

| Flag | What it does |
|---|---|
| `--since=<ref or date>` | Diff base: a git ref (`origin/main`, `HEAD~5`) or a date (`"2 weeks ago"`). Default: `origin/main`. |
| `--window=1w` / `14d` / `2m` | Last N of activity, anchored to HEAD's commit date (not wall clock). |
| `--full` | Scan the whole repo. Expensive, prefer git-scoped modes. |
| `--recommend` | Add suggested keys, translations, and insertion points to the output. |
| `--include-technical` | Show strings classified as technical too (URLs, log messages, etc.). |
| `--ignore <pattern>` | Exclude paths. Repeatable. |
| `--fail-on any|user-facing` | Exit non-zero when findings exist. Meant for CI. |
| `--dry-run` | Print what would be scanned (and what will be skipped at zero cost) without calling the LLM. |
| `--output-format json` | Emit JSON instead of the text report. |

## Using it in CI

Set `ANTHROPIC_API_KEY`, add a step that runs `localesniff scan --since=origin/main --fail-on=user-facing --output-format=json > report.json`, and fail the build on non-zero exit. Archive `report.json` so reviewers can see what was flagged.

A Jenkins example (and JUnit/SARIF output) is coming.

## What's not in here yet

- `apply` subcommand that writes the suggested edits for you
- JUnit / SARIF output formats
- `.stringsdict` plurals and `<plurals>` on Android
- A UI for non-devs to triage findings
