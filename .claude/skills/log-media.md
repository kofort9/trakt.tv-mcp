---
name: log-media
description: Skill for logging watched media (TV episodes and movies) to Trakt.tv with local cache backup
---

# Log Media Skill

This skill enables the trakt-watch-companion agent to log watched media to Trakt.tv while maintaining a rich local cache for user data ownership.

## Capabilities

- Log single episodes as watched
- Log single movies as watched
- Bulk log multiple episodes (using ranges like "1-5" or "1,3,5")
- Bulk log multiple movies
- Handle disambiguation when multiple matches found
- Maintain detailed local watch history cache
- Track rewatches with watch counts
- Store rich metadata for personal insights

## Architecture: Dual-Write Strategy

**Database Agnostic Approach:** This skill maintains a local copy of watch history to avoid tight coupling to Trakt.tv as the sole data source.

```
User Request
    ↓
Claude interprets natural language → ISO 8601 dates
    ↓
1. Call Trakt.tv MCP tool
    ↓
2. Update local cache (.claude/data/watch-history.json)
    ↓
3. Return confirmation to user
```

Benefits:
- **User Data Ownership**: You own your watch history locally
- **Offline Access**: Query history without API calls
- **Reliability**: Backup in case of Trakt API issues
- **Rich Metadata**: Store more data than Trakt returns
- **Future Portability**: Sync to other platforms later
- **Rate Limit Friendly**: Reduces API pressure

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

## Local Cache Schema

Storage location: `.claude/data/watch-history.json`

```json
{
  "version": "1.0",
  "lastUpdated": "2025-12-09T15:30:00.000Z",
  "movies": [
    {
      "id": "uuid-v4",
      "type": "movie",
      "title": "Dune",
      "year": 2021,
      "ids": {
        "trakt": 123456,
        "imdb": "tt1160419",
        "tmdb": 438631
      },
      "watchedAt": "2025-12-08T00:00:00.000Z",
      "loggedAt": "2025-12-09T15:30:00.000Z",
      "syncedToTrakt": true,
      "source": "manual",
      "rawUserInput": "Watched Dune yesterday",
      "genres": ["science-fiction", "adventure"],
      "runtime": 155,
      "isRewatch": false,
      "watchCount": 1,
      "rating": null,
      "notes": null
    }
  ],
  "episodes": [
    {
      "id": "uuid-v4",
      "type": "episode",
      "show": {
        "title": "Breaking Bad",
        "year": 2008,
        "ids": {
          "trakt": 1388,
          "imdb": "tt0903747",
          "tmdb": 1396,
          "tvdb": 81189
        },
        "genres": ["drama", "thriller", "crime"],
        "network": "AMC",
        "status": "ended"
      },
      "season": 5,
      "episode": 16,
      "episodeTitle": "Felina",
      "episodeOverview": "Walter White comes to terms with his actions...",
      "runtime": 55,
      "watchedAt": "2025-12-08T00:00:00.000Z",
      "loggedAt": "2025-12-09T15:30:00.000Z",
      "syncedToTrakt": true,
      "source": "manual",
      "rawUserInput": "I finished Breaking Bad S5E16 yesterday",
      "isRewatch": false,
      "watchCount": 1,
      "rating": null,
      "notes": null
    }
  ],
  "stats": {
    "totalMovies": 1,
    "totalEpisodes": 1,
    "uniqueShows": 1,
    "totalWatchTimeMinutes": 210,
    "lastWatched": "2025-12-08T00:00:00.000Z"
  }
}
```

## Cache Fields Reference

| Field | Purpose |
|-------|---------|
| `id` | Unique UUID for deduplication |
| `ids.*` | Cross-platform IDs (Trakt, IMDB, TMDB, TVDB) |
| `watchedAt` | When the user actually watched |
| `loggedAt` | When the entry was created |
| `syncedToTrakt` | Whether successfully synced to Trakt.tv |
| `source` | How entry was created: "manual", "bulk", "import" |
| `rawUserInput` | Original natural language for audit/debugging |
| `isRewatch` | Whether this is a repeat viewing |
| `watchCount` | Total times watched (incremented on rewatches) |
| `rating` | User rating (1-10) if provided |
| `notes` | Optional user notes about the viewing |
| `genres`, `runtime`, `network` | Rich metadata for insights |
| `stats` | Aggregate statistics for quick summaries |

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

### 6. Update Local Cache
- Add new entry with full metadata
- For rewatches: increment `watchCount`, set `isRewatch: true`
- Update `stats` aggregates
- Set `syncedToTrakt: true` if API succeeded

### 7. Confirm to User
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
4. Update local cache with full episode data
5. Response: "Logged Breaking Bad S1E1 'Pilot' as watched on Dec 8, 2025"
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
5. Update local cache
6. Response: "Logged Dune (2021) as watched on Dec 2, 2025"
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
4. Update local cache with 5 episode entries
5. Response: "Logged 5 episodes of Stranger Things Season 4 as watched"
```

### Handle Rewatch
```
User: "Rewatched Inception last night"

1. Claude converts "last night" → "2025-12-08"
2. Check local cache: existing entry found for Inception
3. Call log_watch (Trakt supports multiple watches)
4. Update local cache:
   - Increment watchCount: 1 → 2
   - Set isRewatch: true
   - Add new watchedAt timestamp
5. Response: "Logged Inception as watched (2nd time) on Dec 8, 2025"
```

## Error Handling

| Scenario | Action |
|----------|--------|
| Trakt API fails | Log locally with `syncedToTrakt: false`, inform user |
| Show not found | Suggest checking spelling, offer to search |
| Ambiguous match | Present top 3-5 options with year/network |
| Invalid date | Ask for clarification, suggest format |
| Episode doesn't exist | Verify season/episode with search_episode first |
