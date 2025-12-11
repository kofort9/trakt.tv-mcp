---
name: log-media
description: Skill for logging watched media (TV episodes and movies) to Trakt.tv
---

# Log Media Skill

This skill enables the trakt-watch-companion agent to log watched media to Trakt.tv.

## Capabilities

- Log single episodes as watched
- Log single movies as watched
- Bulk log multiple episodes (using ranges like "1-5" or "1,3,5")
- Bulk log multiple movies
- Handle disambiguation when multiple matches found

## Architecture: Trakt-First Approach

```
User Request
    ↓
Claude interprets natural language → ISO 8601 dates
    ↓
1. Call Trakt.tv MCP tool
    ↓
2. Return confirmation to user
```

> **[DEFERRED FEATURE]** Local caching (`.claude/data/watch-history.json`) is planned but not yet implemented.
> All watch history is currently stored exclusively on Trakt.tv.

## Date Handling

**CRITICAL:** Tools only accept ISO 8601 dates. Claude must convert natural language before calling tools.

| User Input | Tool Receives |
|------------|---------------|
| "yesterday" | `"2025-12-08"` |
| "last night" | `"2025-12-08"` |
| "3 days ago" | `"2025-12-06"` |
| "last week" | `"2025-12-02"` |
| "last Monday" | Calculated date |
| No date | Parameter omitted (defaults to now) |

Accepted formats:
- Date only: `2025-12-08`
- Full timestamp: `2025-12-08T20:30:00.000Z`

## Workflow

### 1. Receive Request
Parse user intent: media name, type (movie/episode), date, and any additional context.

### 2. Convert Dates
Claude converts natural language to ISO 8601 BEFORE calling any tools.

### 3. Search for Media
Use `search_show` to find the media and get metadata.

### 4. Handle Disambiguation
If multiple matches found, present options to user with year/traktId for selection.

### 5. Log to Trakt.tv
Call `log_watch` (single) or `bulk_log` (multiple) with ISO dates.

### 6. Confirm to User
Report success with details: "Logged Breaking Bad S5E16 as watched on Dec 8, 2025"

## Tools Used

| Tool | Purpose |
|------|---------|
| `mcp__trakt__search_show` | Find media by name, get IDs and metadata |
| `mcp__trakt__search_episode` | Find specific episode details |
| `mcp__trakt__log_watch` | Log single movie or episode |
| `mcp__trakt__bulk_log` | Log multiple episodes or movies at once |

## Examples

### Log Single Episode
```
User: "I watched Breaking Bad S1E1 yesterday"

1. Claude converts "yesterday" → "2025-12-08"
2. Call search_show to get show metadata
3. Call log_watch:
   - type: "episode"
   - showName: "Breaking Bad"
   - season: 1
   - episode: 1
   - watchedAt: "2025-12-08"
4. Response: "Logged Breaking Bad S1E1 'Pilot' as watched on Dec 8, 2025"
```

### Log Movie
```
User: "Watched Dune last week"

1. Claude converts "last week" → "2025-12-02"
2. Call search_show to get movie metadata (returns 2021 and 1984 versions)
3. If ambiguous: "Which Dune? (1) Dune 2021, (2) Dune 1984"
4. Call log_watch:
   - type: "movie"
   - movieName: "Dune"
   - year: 2021
   - watchedAt: "2025-12-02"
5. Response: "Logged Dune (2021) as watched on Dec 2, 2025"
```

### Bulk Log Episodes
```
User: "Binged Stranger Things S4 episodes 1-5"

1. No date specified → omit watchedAt (defaults to now)
2. Call search_show to get show metadata
3. Call bulk_log:
   - type: "episodes"
   - showName: "Stranger Things"
   - season: 4
   - episodes: "1-5"
4. Response: "Logged 5 episodes of Stranger Things Season 4 as watched"
```

### Handle Rewatch
```
User: "Rewatched Inception last night"

1. Claude converts "last night" → "2025-12-08"
2. Call log_watch (Trakt supports multiple watches)
3. Response: "Logged Inception as watched on Dec 8, 2025"
```

## Error Handling

| Scenario | Action |
|----------|--------|
| Trakt API fails | Inform user, suggest trying again later |
| Show not found | Suggest checking spelling, offer to search |
| Ambiguous match | Present top 3-5 options with year/network |
| Invalid date | Ask for clarification, suggest format |
| Episode doesn't exist | Verify season/episode with search_episode first |
