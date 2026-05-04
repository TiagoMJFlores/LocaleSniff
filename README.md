# LocaleSniff

Catches hardcoded user-facing strings in mobile codebases before they ship. Point it at a git diff and it flags every string that should have been externalized. Ask for a recommendation and it also proposes a key name, translates into every locale your project supports, and tells you the exact file and line where each entry belongs.

Built for Jenkins, works from the terminal, supports iOS (Swift, Obj-C) and Android (Kotlin, Java, XML). Detection is LLM-based (Claude), so there's nothing to configure per framework.

<!-- TODO: add screenshot of the CLI output against a real diff -->

## Why

Hardcoded strings keep slipping into releases. A dev pushes a quick fix, forgets to externalize the string, nobody catches it in review, and QA finds a button in plain English the day before the release in France. The fix itself is trivial, but everything around it (re-cutting the build, re-testing, the schedule slip) is not.

The checks that would catch it exist but don't run at the right moment. Xcode's `Missing Localizability` is a local warning. Android Lint's `MissingTranslation` doesn't look inside Kotlin. Pseudolocalization needs someone to run the app by hand. LocaleSniff runs on the pipeline, on the diff, before the merge or the release cut.

## What it does

Two modes:

**Detect (default, cheap):**
- Runs on a git diff you choose (a PR branch vs `main`, the last commit, the last two weeks of activity)
- Flags every hardcoded user-facing string in the added lines
- Ignores strings already wrapped in `NSLocalizedString`, `String(localized:)`, `getString(R.string.*)`, `stringResource(R.string.*)`
- Skips technical strings (log messages, URLs, enum raw values, etc.) and summarizes them as a single line

**Recommend (`--recommend`):**
- Suggests a key name aligned with your project's existing naming convention
- Generates translations for every locale already present in the project
- For each locale file, shows the exact line to insert the new entry, anchored to an existing key so the insertion stays stable as the file evolves
- If the string already exists somewhere in the locale files, offers the reuse option instead of a fresh key (and fills in missing translations if some locales still don't have it)

## Quick start

```bash
npm install
npm run build
npm link

# set your API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# scan the last commit
localesniff scan --since=HEAD~1

# scan a PR branch with suggested keys + translations
localesniff scan --since=origin/main --recommend

# scan the last week, skip tests
localesniff scan --window=1w --ignore "**/*Tests*/**" --ignore "**/*Spec.swift"
```

## CLI flags

| Flag | What it does |
|---|---|
| `--since=<ref or date>` | Diff base: a git ref (`origin/main`, `HEAD~5`) or a date (`"2 weeks ago"`). Default: `origin/main`. |
| `--window=1w` / `14d` / `2m` | Last N of activity, anchored to HEAD's commit date. |
| `--full` | Scan the whole repo. Expensive, prefer git-scoped modes. |
| `--recommend` | Add suggested keys, translations, and insertion points. |
| `--include-technical` | Show strings classified as technical too. |
| `--ignore <pattern>` | Exclude paths. Repeatable. |
| `--fail-on any\|user-facing` | Exit non-zero when findings exist. |
| `--dry-run` | Print what would be scanned without calling the LLM. |
| `--output-format json` | Emit JSON instead of text. |

## Using it in Jenkins

Two natural places:

**Before merge.** On a PR branch, fail the build if new hardcoded strings were added.

```
localesniff scan --since=origin/main --fail-on=user-facing
```

**Before release.** In the release pipeline, diff against the last tag and block the cut if anything slipped through.

```
localesniff scan --since=v2.3.0 --fail-on=user-facing
```

Both can coexist. You can also run the same commands locally to review a branch before approving it.

## How it works

Detection is LLM-based (Claude), not AST-based. That keeps the tool framework-agnostic (SwiftUI, UIKit, Compose, old XML layouts, it doesn't matter) and lets it make judgement calls like "this `print` is a debug log, not a user message". Results are cached per file, per prompt version, and per mode, so re-running against the same diff is effectively free.
