# Quick Start Guide - Bulk Import

## TL;DR

```bash
# 1. Create your CSV files (see format below)
# 2. Always test with dry-run first
npm run bulk-import -- --movies movies.csv --dry-run

# 3. If results look good, run actual import
npm run bulk-import -- --movies movies.csv
```

## CSV Format

### Movies (movies.csv)
```csv
title,year,watched_date
The Matrix,1999,2024-01-15
Inception,2010,2024-01-20
```

### Episodes (episodes.csv)
```csv
show_name,season,episode,watched_date
Breaking Bad,1,1,2024-01-10
Stranger Things,4,1,2024-01-15
```

## Common Commands

```bash
# Test with sample data
npm run bulk-import -- --movies scripts/sample-movies.csv --dry-run
npm run bulk-import -- --episodes scripts/sample-episodes.csv --dry-run

# Import your data
npm run bulk-import -- --movies my-movies.csv --dry-run  # Preview first!
npm run bulk-import -- --movies my-movies.csv             # Actually import

# Import both movies and episodes
npm run bulk-import -- --movies movies.csv --episodes episodes.csv --dry-run
npm run bulk-import -- --movies movies.csv --episodes episodes.csv

# Show help
npm run bulk-import -- --help
```

## Important Notes

1. **Always use dry-run first**: `--dry-run` flag shows what will be imported without making changes
2. **Include year for movies**: Helps avoid ambiguous matches
3. **Date format**: Use YYYY-MM-DD (e.g., 2024-01-15)
4. **Authentication required**: Run the MCP server once to authenticate before using bulk import

## Troubleshooting

**"Not authenticated"**: Run `npm run build && node dist/index.js` once to authenticate

**"Validation failed"**: Check your CSV format matches exactly (columns, date format)

**"Ambiguous matches"**: Add year for movies, use exact show names from Trakt.tv

For more details, see the full [README.md](README.md)
