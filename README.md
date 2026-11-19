# Route Health workshop

Blossom Com received reports of failed outbound calls around 14:00 UTC. You are the communications provider’s shift analyst. Identify the route to investigate, compare it with the preceding 15 minutes, and inspect the call attempts behind your decision.

The starter runs on OpenJDK 8 and serves the React screen from a single JAR. It includes the React source and three synthetic CSV batches. Use CodeMod to manage both changes in one local Git migration record. First, plan and verify the Amazon Corretto 25 upgrade with React still running. Then continue from that checkpoint to migrate the screen to Angular. [Lab prompts and facilitator guide](WORKSHOP.md)

## Before class

Unzip the workshop into a writable folder and open a terminal there. Install Git and Node 24 with npm (the pinned version is in `.nvmrc`). Install the two JDKs side by side and choose builds for your CPU. Open the folder in Codex and confirm that you can select the CodeMod plugin.

- **Starting app:** Use OpenJDK 8. Set `JAVA8_HOME` to its JDK directory.
- **Migration target:** Use Amazon Corretto 25. Set `JAVA25_HOME` to select it explicitly. [Corretto 25 JDK downloads](https://docs.aws.amazon.com/corretto/latest/corretto-25-ug/downloads-list.html)
- [Node downloads](https://nodejs.org/en/download)

| From the unpacked folder | macOS Terminal | Windows PowerShell |
|---|---|---|
| Check the toolchain | `sh workshop.sh doctor` | `.\workshop.cmd doctor` |
| Establish the local Git baseline | `sh workshop.sh init` | `.\workshop.cmd init` |
| Install React dependencies and build the starter | `sh workshop.sh warmup` | `.\workshop.cmd warmup` |
| Start Java 8 and React | `sh workshop.sh start legacy` | `.\workshop.cmd start legacy` |

Open **http://127.0.0.1:8080/**. The first start processes the daily sample when no reports exist. Select **March 10, 14:00 UTC**, compare each route’s 503 rate with its prior rate, and open a route to inspect individual attempts. Filter by **503** and then by **486**. Keep the server terminal open. Use Ctrl+C to stop it. You can pass a different port, for example `start legacy 8081`.

If `doctor` cannot find a JDK, set `JAVA8_HOME` and `JAVA25_HOME` in this shell to the actual JDK directories containing `bin/java` or `bin\java.exe`. On macOS these typically end in `Contents/Home`. In PowerShell use `$env:JAVA8_HOME = 'C:\path to your Java 8 JDK'` and the equivalent for `JAVA25_HOME`. The workshop selects each runtime explicitly. The prebuilt legacy JAR can start before warmup. Warmup needs access to npm and Maven, so run it before the session.

## Drop a file and inspect the mutation

In a **second terminal**, run the commands below. On Windows replace `sh workshop.sh` with `.\workshop.cmd`.

```sh
sh workshop.sh sample walkthrough
sh workshop.sh process legacy
sh workshop.sh verify legacy walkthrough
```

`sample` copies a fixture into `inbox/`. You can also drop a CSV there yourself. `process legacy` processes the CSVs currently in the folder. Click **Refresh** in the browser and choose the new batch. A completed drop publishes three files under `work/legacy/processed/<batch>/`:

| File | Contents |
|---|---|
| `enriched.csv` | Every input row in order, plus route name, region, carrier, 15-minute UTC window, call outcome, and a duplicate flag. |
| `summary.json` | Batch counts, the SHA-256 of the source file, and counts per route and window. |
| `attempts.json` | One row per distinct attempt for browser drilldown. |

The source file stays in the inbox. Identical replays are safe. For changed content, use a new batch name or clear the generated reports with `reset legacy`. Use lowercase letters, digits, underscores and hyphens for batch names. A failed batch publishes no partial result. The built-in verifier checks the three supplied fixtures.

## What to open in the repo

| Location | Purpose |
|---|---|
| `backend/` | Java 8 processor, loopback web server, Maven project and wrappers |
| `ui-react/`, `dist/route-health-legacy.jar` | React source, built browser assets, runnable baseline |
| `fixtures/`, `reference/`, `expected/` | Call records, route directory and expected results |
| `tools/generate-fixtures.mjs`, `tools/verify.mjs` | Deterministic data generator and independent acceptance check |
| `WORKSHOP.md` | Two-hour outline, prompts for both CodeMod labs and acceptance criteria |

The Maven wrapper is distributed under the [Apache License 2.0](notices/apache-wrapper-license.txt). Notices for the bundled React assets are in `ui-react/dist/third-party.txt`.

The OpenAI Blossom is a trademark of OpenAI. The workshop bundles the official icon assets for local use. [OpenAI brand assets](https://openai.com/brand/)
