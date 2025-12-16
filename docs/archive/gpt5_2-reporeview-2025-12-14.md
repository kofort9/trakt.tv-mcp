Review of trakt.tv-mcp and UX improvement ideas  
**Archived:** 2025-12-14 (superseded by docs/architecture/future-work.md and TECHNICAL_DEBT.md backlog)
1. Current user experience

Rich natural‑language logging and search:
The MCP server exposes tools that let an AI assistant log, search and summarise watch activity. The input schemas defined in src/index.ts cover tasks such as log_watch, bulk_log, get_history, summarize_history, get_upcoming and follow/unfollow shows
github.com
. These handlers convert natural language into structured Trakt API calls via functions in src/lib/tools.ts which perform input validation, search for matching movies/episodes, handle disambiguation and log the watches
github.com
. Bulk operations support parsing episode ranges and deduplication
github.com
. The README describes key features such as smart disambiguation and bulk logging
github.com
.

QA/UX guidelines:
The repository contains design documentation and agent guides. .claude/agents/watch-tracker-qa-ux.md lists critical test scenarios including ambiguous titles, vague ranges, partial completion, rewatches, duplicates and API errors
github.com
. These scenarios highlight many edge cases users may encounter. The natural language skill guide emphasises converting human input into ISO‑8601 dates, handling ambiguity and providing clear confirmations
github.com
.

Security and observability:
The MCP server stores user tokens securely and logs history through a local directory with restricted permissions
github.com
. The team uses Langfuse for observability and structured logging.

Offline logging PR (#21):
A new pull request adds a logwatch CLI tool for offline capture. It allows users to queue notes when the AI or Trakt.tv is unavailable. The CLI stores entries as JSONL in ~/.trakt-mcp/pending-logs.jsonl with owner‑only permissions and deduplicates identical entries【445607594685011†L8-L10】. It supports appending a note (logwatch "note") and listing queued entries (logwatch list [limit]). Tests verify deduplication, listing and secure file permissions. The PR updates the README with usage instructions
github.com
.

2. Pain points and opportunities

Ambiguity handling: User queries can be vague (e.g. “watched The Office S2E3” without year). The current approach searches Trakt and asks the assistant to disambiguate but lacks a feedback loop—users may not know why a search failed or how to refine it.

Date/time confusion: Inputs often include relative terms (“yesterday”, “last night”). Users may be unaware of timezone conversions; the manual E2E plan recommends clarifying the timezone and converting to ISO dates
github.com
.

Bulk logging complexity: Logging multiple episodes with ranges can succeed partially; users need to know which entries were logged and which failed. The QA guide lists partial completion and duplicate handling as critical cases
github.com
.

Undo/updates: Currently there is no way to undo or edit a logged entry. Users must manually remove an incorrect log via Trakt or re‑log the correct entry.

Limited offline support: The PR introduces a simple queue but lacks interactive guidance. Entries are stored with only raw text; no attempt is made to parse or provide instant feedback. The manual E2E plan suggests showing a parsed guess and letting users correct it
github.com
.

User‑level analytics: There is no local store of watch history or user ratings. Without this, it is difficult to analyse personal preferences or train a recommendation model.

3. Recommendations for logging UX
3.1 Disambiguation and feedback

Interactive clarification: When a search returns multiple matches, the assistant should present a concise list (e.g., top three shows with year/genre) and ask the user to choose. Displaying the show poster or tagline (where available) could speed up selection.

Explain failures: If a query cannot be matched, return a short error explaining whether it failed because of typos, missing year, or network issues. Suggest refinements like adding the release year or season/episode.

Preview before logging: After parsing natural language input and before submitting to Trakt, show a summary of what will be logged (title, season, episode, date). Let the user confirm or correct it. This would reduce mistakes and align with the manual plan’s “instant feedback” suggestion
github.com
.

Support mood/ratings: Extend the schema to accept optional user ratings or moods (e.g., 9/10, felt nostalgic). These can be stored locally and used later for recommendations.

3.2 Handling dates and timezones

Timezone awareness: When users specify relative dates (“yesterday at 8pm”), display the interpreted absolute date/time and timezone. Offer the ability to change the timezone per user, as not all users are in the same zone.

Flexible date parsing: Accept common synonyms (e.g., “last night”, “two days ago”) and automatically convert to ISO‑8601. Provide examples in the README to guide users on acceptable phrases.

3.3 Bulk operations and undo

Batch confirmation summary: For bulk_log, present a table summarising each parsed entry (show, episode range, count) and highlight any unresolved or ambiguous items. Ask the user whether to proceed with the successful subset or cancel.

Undo capability: Implement a undo_last_log or remove_log tool that removes the most recent logged entries or a specified entry. This could call Trakt’s delete API, providing a safety net for mistakes.

Idempotent logging: When logging entries, check the local cache or Trakt history to avoid duplicate logs. Provide an option to allow duplicate logging for rewatches.

3.4 Additional input patterns

Season/series level logging: Allow commands like “log that I finished season 2 of The Bear” or “watched The Bear S1”. The tool should translate this to individual episode logs or a single aggregated log.

Structured range syntax: Accept not only S2E1-5 but also natural phrasing like “episodes 1 through 5 of season 2.” Include this in the quick‑start examples.

Voice or chat capture: Provide a Slack or voice assistant integration to capture notes quickly, as the manual E2E plan proposes
github.com
.

3.5 User education and documentation

Improved README examples: Add more examples covering ambiguous titles, partial seasons, rewatches and ratings. Use tables to summarise which commands are supported.

Onboarding wizard: Create an onboarding flow that walks new users through connecting their Trakt account, practising a few logging commands and learning how to handle errors.

4. Feedback on offline CLI (logwatch) PR

The logwatch CLI introduced in PR #21 is a solid first step towards offline logging. It respects secure file permissions and deduplicates notes【445607594685011†L8-L10】. Suggestions to enhance it:

Parse notes on capture: When a note is added, attempt to parse it into potential fields (title, type, date). Show a preview and confidence score (e.g., via fuzzy matching or a small parser). Allow users to correct the guess before it is stored. This aligns with the manual E2E plan’s recommendation for “instant feedback” and quick fixes
github.com
.

Metadata enrichment: Store more than just the raw text—include fields like capturedAt, titleGuess, dateGuess, status and source (e.g., cli, slack) to aid later reconciliation. The queue class in the PR already supports id and capturedAt; adding guess fields would not break compatibility.

Editing queued entries: Provide a logwatch fix <id> command to edit or remove entries. This allows users to correct mistakes before syncing.

Batch import and sync: Add a logwatch sync command that reads the queue and pushes entries to the MCP server using log_watch or bulk_log. It should summarise results and update the queue status (e.g., mark entries as synced or failed). Provide a --dry-run option for safety.

Integration with MCP server: The CLI could call the server’s search_show or search_episode tools to pre‑validate entries even while offline using a cached database (see next section).

Better listing output: Format the output of logwatch list into a table showing id, capturedAt, raw, and status. Optionally add a --json flag for machine‑readable output.

5. Local database and recommendation model

Creating a local database to store watch history can unlock richer analytics and personalised recommendations.

5.1 Database design

Choose a lightweight database: SQLite is easy to embed and does not require a separate server. It supports full SQL queries and can be read by Python/R for analysis.

Schema suggestions: A watch_history table could include:

id (UUID)

source (e.g., trakt, manual, offline)

title, year, media_type (movie/show/episode)

season and episode numbers (nullable)

watched_at (ISO‑8601)

rating (nullable)

tags (comma‑separated or join table)

synced (boolean) to track whether the entry has been synced to Trakt.

Populate the database: On first run, call get_history and bulk_log to backfill existing history. Then, update the database whenever log_watch or the offline queue sync runs. You could also ingest data from external sources (e.g., CSV import script) to enrich the dataset.

5.2 Analytics and model training

Preference insights: Use simple queries to compute most‑watched genres, directors or actors. Track average rating over time and detect shifts in preferences (e.g., binge periods, seasonal patterns).

Collaborative and content‑based filtering:

Combine your watch history with metadata from sources like TheMovieDB or IMDb (genres, cast, keywords).

Use a Python library such as Surprise
 or LightFM
 to train a recommendation model. For example, treat each watched item as positive feedback and incorporate genre or actor features in a hybrid model.

On‑device ML: Start with a lightweight model (e.g., matrix factorisation) and evaluate offline. Expose an MCP tool like get_recommendations that accepts optional filters (genre, release year) and returns personalised suggestions.

Protect privacy: Since this database contains personal viewing habits, ensure it is encrypted at rest (e.g., using SQLCipher) and never leaves the local machine without consent.

5.3 Integration with MCP

Model API: Add a new tool in src/index.ts (e.g., recommend_media) that reads from the local database and returns recommendations. If the local model is unavailable, fallback to generic trending recommendations from Trakt or TMDb.

Feedback loop: When the user rates a recommended item or logs a new watch, feed that back into the model to improve future predictions.

6. Conclusion

The trakt.tv-mcp project already offers a strong foundation for natural language watch logging. To make the user experience more efficient and delightful, focus on richer feedback during logging (especially disambiguation and confirmation), robust bulk operations with undo, improved offline capture that parses and edits notes, and enhanced documentation. Introducing a local database will enable deeper analytics and personalised recommendations, turning the system from a logging tool into a smart media companion.
