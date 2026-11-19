# Facilitating Route Health

Participants use OpenJDK 8 to run the starter JAR that serves the React app. They deliver one JAR that processes a batch of call attempts on Amazon Corretto 25 and serves an Angular screen for investigating the results. Rehearse the timing on a representative participant laptop. Do the README toolchain and network warmup before the session.

## Two-hour exercise

| Budget | Participant activity | Evidence at the end |
|---|---|---|
| 0–15 minutes | Start the Java 8 JAR, inspect the walkthrough CSV, investigate the daily incident in React. | A route, time window, current and preceding 503 rates, and one raw attempt ID. |
| 15–40 minutes | In ordinary Codex, upgrade the Java build and processor to Corretto 25. Keep React as the UI for this checkpoint. | Target JDK identified, Java 25 bytecode packaged, fixture checks pass, same route visible in React. |
| 40–100 minutes | In CodeMod, bound the work to the React screen and the provided Angular workspace. Review existing behaviors, agree the brief, transform, and review the target. | Angular renders the same report, ranks and drills into live processed data. |
| 100–120 minutes | Package the target JAR, run the second-day batch, and investigate the new incident through Angular. | Independent file checks pass and the group can explain the new route and time window. |

### First checkpoint: runtime

Suggested prompt for ordinary Codex:

> Upgrade the backend in this repository from OpenJDK 8 to Amazon Corretto 25. Preserve the processor’s inputs, outputs, duplicate handling, source checksum and UTC windows. Keep the React UI for this checkpoint. Build the target and verify the walkthrough and daily fixtures using the workshop launcher.

Commands below use macOS spelling. In Windows PowerShell substitute `.\workshop.cmd` for `sh workshop.sh`.

```sh
sh workshop.sh build target react
sh workshop.sh process target walkthrough
sh workshop.sh verify target walkthrough
sh workshop.sh process target daily
sh workshop.sh verify target daily
sh workshop.sh start target 8081
```

The baseline uses the JAXB utility shipped with Java 8 to format the source checksum. That JDK API is absent in Corretto 25. Preserve the lowercase SHA-256 value for the same input bytes. The build launcher also checks the emitted class-file version. Commit the validated runtime checkpoint before starting the UI migration. [OpenJDK JEP 320](https://openjdk.org/jeps/320)

### Second checkpoint: React to Angular

Suggested CodeMod intent:

> Migrate the Route Health investigation screen from ui-react to ui-angular. Keep the existing batch report formats and Java service interface. Preserve batch and UTC window selection, descending 503-rate ranking, previous-window rates, route drilldown, outcome filtering, pagination and refresh. Use the local repo to track the migration. Package the result with the Java 25 backend.

Use the plugin to initialize the migration, review the source behaviors and brief, run the transformation, and verify the result. Participants should exercise the UI themselves. The file verifier covers the processor’s output.

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
