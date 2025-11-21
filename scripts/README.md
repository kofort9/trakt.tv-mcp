# Trakt Bulk Import Script

A TypeScript script to bulk import historical watch data from CSV files directly to the Trakt API. This bypasses the MCP server for efficiency with large historical datasets (100+ movies/episodes).

## Features

- Import movies and TV episodes from CSV files
- Automatic search and matching against Trakt database
- Data validation (required fields, date formats)
- Dry-run mode for safe preview before execution
- Progress tracking with visual feedback
- Parallel API calls with rate limiting (respects Trakt API limits)
- Error handling with retry logic for rate limits
- Comprehensive summary reports
- Handles disambiguation (prompts when multiple matches found)

## Prerequisites

1. **Trakt Authentication**: You must be authenticated with Trakt before running the import. Run the MCP server at least once to authenticate:
   ```bash
   npm run build
   node dist/index.js
   ```

2. **CSV Files**: Prepare your CSV files according to the format below.

## CSV Format

### Movies CSV

Create a file with these columns:

```csv
title,year,watched_date
The Matrix,1999,2024-01-15
Inception,2010,2024-01-20
Dune,2021,2024-02-10
```

**Columns:**
- `title` (required): Movie title
- `year` (optional): Release year (helps with disambiguation)
- `watched_date` (required): Date watched in YYYY-MM-DD format

### Episodes CSV

Create a file with these columns:

```csv
show_name,season,episode,watched_date
Breaking Bad,1,1,2024-01-10
Breaking Bad,1,2,2024-01-11
Stranger Things,4,1,2024-01-15
```

**Columns:**
- `show_name` (required): TV show name
- `season` (required): Season number (0 for specials)
- `episode` (required): Episode number
- `watched_date` (required): Date watched in YYYY-MM-DD format

## Usage

### Basic Commands

**Dry-run (recommended first):**
```bash
npm run bulk-import -- --movies movies.csv --dry-run
```

**Import movies only:**
```bash
npm run bulk-import -- --movies movies.csv
```

**Import episodes only:**
```bash
npm run bulk-import -- --episodes episodes.csv
```

**Import both movies and episodes:**
```bash
npm run bulk-import -- --movies movies.csv --episodes episodes.csv
```

**Show help:**
```bash
npm run bulk-import -- --help
```

### Command-Line Options

- `--movies <path>`: Path to movies CSV file
- `--episodes <path>`: Path to episodes CSV file
- `--dry-run`: Preview matches without importing to Trakt
- `--help`, `-h`: Display help message

## How It Works

### 1. Data Validation

The script validates your CSV data before processing:
- Checks for required fields
- Validates date format (YYYY-MM-DD)
- Validates season/episode numbers
- Validates year ranges

### 2. Search and Match

For each entry, the script:
- Searches the Trakt database
- Attempts to find exact matches
- Handles disambiguation when multiple matches are found
- Tracks failed searches

**Matching Logic:**
- **Movies**: Matches by title and optional year
- **Episodes**: First finds the show, then locates the specific episode

### 3. Import to Trakt

If not in dry-run mode, the script:
- Batches matched items into a single API request
- Adds items to your Trakt watch history with the specified dates
- Reports success and any items that couldn't be added

## Output Examples

### Dry-Run Output

```
============================================================
[DRY-RUN] Trakt Bulk Import
============================================================

✔ Trakt client initialized
✔ Read 10 movies from movies.csv
✔ Validated 10 movies
✔ Processed 10 movies

============================================================
[DRY-RUN] Bulk Import Summary
============================================================

Results:
  ✓ Successfully matched: 10
    - Movies: 10
    - Episodes: 0

Sample Movie Matches:
  ✓ The Matrix (1999) [Trakt ID: 481]
  ✓ Inception (2010) [Trakt ID: 16662]
  ✓ Dune (2021) [Trakt ID: 338970]

[DRY-RUN] No changes were made to your Trakt history.
Run without --dry-run to perform the actual import.

============================================================
```

### Actual Import Output

```
============================================================
Trakt Bulk Import
============================================================

✔ Trakt client initialized
✔ Read 10 movies from movies.csv
✔ Validated 10 movies
✔ Processed 10 movies
✔ Import completed

============================================================
Bulk Import Summary
============================================================

Results:
  ✓ Successfully matched: 10
    - Movies: 10
    - Episodes: 0

Import Results:
  ✓ Added to history: 10
    - Movies: 10
    - Episodes: 0

Sample Movie Matches:
  ✓ The Matrix (1999) [Trakt ID: 481]
  ✓ Inception (2010) [Trakt ID: 16662]
  ✓ Dune (2021) [Trakt ID: 338970]

============================================================
```

### Handling Issues

**Ambiguous Matches:**
```
Ambiguous Matches (requires manual review):
  ? Unknown Movie Title (2020)
    Reason: No exact match found, multiple possibilities
    Found 5 possible matches
```

**Failed Matches:**
```
Failed Matches:
  ✗ Fake Movie That Doesn't Exist (2024)
    Reason: No matches found
```

## Rate Limiting

The script respects Trakt API rate limits (1000 requests per 5 minutes):
- Processes in batches of 10
- Maximum 5 concurrent searches
- 100ms delay between batches
- Automatic retry with exponential backoff on 429 errors

## Error Handling

The script handles various error scenarios:

| Error | Behavior |
|-------|----------|
| CSV format invalid | Shows clear error, stops processing |
| Movie/show not found | Adds to failed list, continues |
| Multiple matches found | Adds to ambiguous list, continues |
| Rate limit hit (429) | Waits and retries with exponential backoff (up to 3 times) |
| Network error | Retries up to 3 times |
| Not authenticated | Shows error message, exits |

## Tips and Best Practices

### 1. Always Start with Dry-Run
```bash
npm run bulk-import -- --movies movies.csv --dry-run
```
Review the matches before committing to import.

### 2. Include Year for Movies
Including the year helps avoid ambiguous matches:
```csv
title,year,watched_date
Dune,2021,2024-02-10  # Much better than just "Dune"
```

### 3. Use Exact Show Names
Use the exact show name as it appears on Trakt:
```csv
show_name,season,episode,watched_date
Breaking Bad,1,1,2024-01-10  # Good
Breaking Bad (2008),1,1,2024-01-10  # May not match
```

### 4. Process Large Imports in Batches
For very large datasets (500+ items), consider splitting into smaller files:
```bash
npm run bulk-import -- --movies movies-part1.csv
npm run bulk-import -- --movies movies-part2.csv
```

### 5. Keep Backups
Always keep your original CSV files as backups.

## Troubleshooting

### "Not authenticated with Trakt"
Run the MCP server once to authenticate:
```bash
npm run build
node dist/index.js
```

### "Failed to read CSV"
- Check file path is correct
- Verify CSV format matches expected columns
- Ensure file encoding is UTF-8

### "Rate limit exceeded"
Wait a few minutes and try again. The script has built-in retry logic, but if you hit limits repeatedly, consider:
- Reducing batch size
- Adding longer delays between batches
- Processing in smaller chunks

### Many Ambiguous Matches
- Add year for movies
- Use exact show names as they appear on Trakt.tv
- Search Trakt.tv website first to verify correct names

## Sample Files

Sample CSV files are included in the `scripts/` directory:
- `sample-movies.csv`: Example movie data
- `sample-episodes.csv`: Example episode data

Test with these files first:
```bash
npm run bulk-import -- --movies scripts/sample-movies.csv --dry-run
npm run bulk-import -- --episodes scripts/sample-episodes.csv --dry-run
```

## Limitations

- **Disambiguation**: The script cannot automatically resolve ambiguous matches. These require manual review.
- **Specials**: Some special episodes may not be found if they have non-standard numbering.
- **API Limits**: Respects Trakt API limits but large imports (1000+ items) will take time.
- **Authentication**: Requires existing Trakt authentication (obtained via MCP server).

## Use Cases

Perfect for:
- Importing past viewing history that wasn't tracked
- Migrating from other tracking services (Letterboxd, MyAnimeList, etc.)
- Batch populating your Trakt profile with known watched content
- Rebuilding your watch history after account issues

## Advanced Usage

### Custom Batch Processing
Edit `scripts/bulk-import.ts` to adjust:
```typescript
{
  maxConcurrency: 5,      // Max concurrent requests
  batchSize: 10,          // Items per batch
  delayBetweenBatches: 100 // Milliseconds between batches
}
```

### Filtering Results
After a dry-run, you can manually edit your CSV to remove problematic entries, then run the import for real.

## Support

For issues or questions:
1. Check this documentation
2. Review the error messages carefully
3. Try with sample data first
4. Verify your CSV format matches exactly
5. Check Trakt API status if all imports are failing

## License

This script is part of the trakt.tv-mcp project and shares the same MIT license.
