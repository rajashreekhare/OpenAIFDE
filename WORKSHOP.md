# Facilitating Route Health

Participants use OpenJDK 8 to run the starter JAR that serves the React app. They use CodeMod to manage two checkpoints in one local Git migration record. The handoff is a JAR that processes a batch of call attempts on Amazon Corretto 25 and serves an Angular screen for investigating the results. Rehearse the timing on a representative participant laptop. Do the README toolchain and network warmup before the session.

## Two-hour exercise

| Budget | Participant activity | Evidence at the end |
|---|---|---|
| 0–15 minutes | Start the Java 8 JAR, inspect the walkthrough CSV, investigate the daily incident in React. | A route, time window, current and preceding 503 rates, and one raw attempt ID. |
| 15–40 minutes | Start in CodeMod and plan the Corretto 25 upgrade. Ask Codex to apply the Java changes. Run the checks and record the results in CodeMod. | Git commit, Java 25 bytecode, passing fixture checks and the same incident visible in React. |
| 40–100 minutes | Resume the same CodeMod migration. Review the React behaviors, approve the Angular brief, then authorize transformation and verification. | Angular renders the same report, ranks routes, and lets the analyst inspect individual attempts. |
| 100–120 minutes | Package the target JAR, run the second-day batch, and investigate the new incident through Angular. | Independent file checks pass and the group can explain the new route and time window. |

### Lab 1. Upgrade the runtime to Amazon Corretto 25

Open the workshop folder in Codex, select `@codemod`, and start with both checkpoints in scope.

> Manage the Route Health screen migration from React to Angular. Use local Git for the migration records. Our first checkpoint is to move the backend from OpenJDK 8 to Amazon Corretto 25 with the React screen still running. Inspect the Java build and processor, plan the runtime changes, and identify the file and browser checks we should run before starting the Angular work.

Review the runtime plan. CodeMod supports assessment and planning for an in-place JDK upgrade. Give Codex the agreed plan to implement.

> Apply the Corretto 25 changes from the plan. Preserve the file formats, source checksum, duplicate handling and UTC windows. Keep the React screen. Build the target with the workshop launcher and verify both the walkthrough and daily fixtures.

Commands below use macOS spelling. In Windows PowerShell substitute `.\workshop.cmd` for `sh workshop.sh`.

```sh
sh workshop.sh build target react
sh workshop.sh process target walkthrough
sh workshop.sh verify target walkthrough
sh workshop.sh process target daily
sh workshop.sh verify target daily
sh workshop.sh start target 8081
```

The baseline uses the JAXB utility shipped with Java 8 to format the source checksum. That JDK API is absent in Corretto 25. Preserve the lowercase SHA-256 value for the same input bytes. The build launcher also checks the emitted class-file version. [OpenJDK JEP 320](https://openjdk.org/jeps/320)

Open React on port 8081 and compare the daily incident with the baseline on port 8080. Commit the verified Java changes. Ask CodeMod to record the commit ID, the two fixture results and the React observation in the existing migration record.

### Lab 2. Migrate the React screen to Angular

Resume the same `@codemod` migration and use its recorded Java checkpoint.

> Continue from the verified Corretto 25 checkpoint. Migrate the investigation screen in ui-react to Angular. Create ui-angular during transformation, using Angular CLI with an npm build script. Install dependencies and commit the lockfile. Carry over the Blossom Com header, browser title and bundled OpenAI Blossom icons. Keep the report formats and Java service interface. Preserve batch and UTC window selection, descending 503-rate ranking, previous-window rates, route drilldown, outcome filtering, pagination and refresh. Package the screen with the Corretto 25 backend.

Review the source behaviors against React and approve the Angular brief. Authorize CodeMod to transform the screen and independently verify the target. Participants then investigate a fresh batch in the browser. Record the target verification and the analyst’s finding alongside the Java checkpoint. The file verifier covers the processor’s output.

Stop any target server from the first checkpoint, then run:

```sh
sh workshop.sh build target angular
sh workshop.sh sample next-day
sh workshop.sh process target next-day
sh workshop.sh verify target next-day
sh workshop.sh start target 8081
```

Open **http://127.0.0.1:8081/** and select the new batch. The distributable target is `dist/route-health-target.jar`. Keep the legacy server on port 8080 if you want a side-by-side comparison.

## Operator’s reference

Each source row describes the final SIP response to one outbound call setup attempt. A retry has a new `attempt_id` and may retain the same `call_id`. A repeated export has the same `attempt_id`. The first appearance counts in summaries. Subsequent appearances stay in the enriched file with `duplicate=true`. A route’s 503 rate is its unique 503 attempts divided by all its unique attempts in that UTC window. Report an observed route symptom. The records alone do not establish its root cause. [SIP response definitions](https://www.rfc-editor.org/rfc/rfc3261.html)

- **200** maps to connected, **486** to busy, **503** to unavailable, and other codes to other.
- The window that starts at 14:00 UTC includes attempts from 14:00 up to 14:15, with 14:15 assigned to the next window.
- The processor reads `reference/routes.csv` to attach route name, region and carrier. It rejects an unmapped route with an input error.
- The UI reads `/data/batches.json`, then `/data/<batch>/summary.json` and `/data/<batch>/attempts.json`. These are read-only reports served by the JAR.
- The 12-row walkthrough includes 11 unique attempts, one repeated export, and a retry. Each full batch has 50,000 rows, 49,500 unique attempts, 500 repeated exports, 12 routes and 32 time windows.

## Facilitator answer key

| Batch | What the operator should find |
|---|---|
| Daily, March 10 | At 14:00 UTC, **Chicago East** returns 24 unavailable responses out of 400 attempts (6.0%). At 13:45 it was 2 of 400 (0.5%). Chicago West has 144 busy responses in the incident window and just 2 unavailable. |
| Next day, March 11 | At 16:30 UTC, **Dallas South** has 36 unavailable out of 400 (9.0%), following 2 of 400 (0.5%). Seattle North supplies the busy-route comparison. |

The fixture generator fixes the seed, routes and incident design. Run `node tools/generate-fixtures.mjs` to regenerate the shipped inputs and expected manifests. A future API exercise can accept batches through HTTP and reuse these fixtures to verify that file and API delivery yield the same route summaries.
