#!/usr/bin/env tsx

/**
 * Bulk Import Script for Trakt Historical Watch Data
 *
 * This script imports historical watch data from CSV files directly to the Trakt API.
 * It bypasses the MCP server for efficiency with large historical datasets (100+ items).
 *
 * Usage:
 *   npm run bulk-import -- --movies movies.csv --dry-run
 *   npm run bulk-import -- --episodes episodes.csv
 *   npm run bulk-import -- --movies movies.csv --episodes episodes.csv
 *   npm run bulk-import -- --help
 */

import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import chalk from 'chalk';
import ora from 'ora';
import { TraktClient } from '../src/lib/trakt-client.js';
import { TraktOAuth } from '../src/lib/oauth.js';
import { loadConfig } from '../src/lib/config.js';
import { parallelMap } from '../src/lib/parallel.js';
import { TraktSearchResult, TraktMovie, TraktShow, TraktEpisode } from '../src/types/trakt.js';

// ============================================================================
// Type Definitions
// ============================================================================

interface MovieRow {
  title: string;
  year?: number;
  watched_date: string;
}

interface EpisodeRow {
  show_name: string;
  season: number;
  episode: number;
  watched_date: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

interface MatchedMovie {
  row: MovieRow;
  movie: TraktMovie;
  watched_at: string;
}

interface MatchedEpisode {
  row: EpisodeRow;
  show: TraktShow;
  episode: TraktEpisode;
  watched_at: string;
}

interface AmbiguousMatch {
  row: MovieRow | EpisodeRow;
  type: 'movie' | 'episode';
  matches: TraktSearchResult[];
  reason: string;
}

interface FailedMatch {
  row: MovieRow | EpisodeRow;
  type: 'movie' | 'episode';
  reason: string;
}

interface ImportResult {
  matchedMovies: MatchedMovie[];
  matchedEpisodes: MatchedEpisode[];
  ambiguous: AmbiguousMatch[];
  failed: FailedMatch[];
  apiResponse?: {
    added: { movies: number; episodes: number };
    not_found: { movies: unknown[]; episodes: unknown[] };
  };
}

interface ParsedArgs {
  moviesPath?: string;
  episodesPath?: string;
  dryRun: boolean;
  help: boolean;
}

// ============================================================================
// CSV Parsing Functions
// ============================================================================

/**
 * Read and parse movies CSV file
 */
function readMoviesCSV(filePath: string): MovieRow[] {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    return records.map((record: Record<string, string>) => ({
      title: record.title,
      year: record.year ? parseInt(record.year, 10) : undefined,
      watched_date: record.watched_date,
    }));
  } catch (error) {
    throw new Error(`Failed to read movies CSV: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Read and parse episodes CSV file
 */
function readEpisodesCSV(filePath: string): EpisodeRow[] {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    return records.map((record: Record<string, string>) => ({
      show_name: record.show_name,
      season: parseInt(record.season, 10),
      episode: parseInt(record.episode, 10),
      watched_date: record.watched_date,
    }));
  } catch (error) {
    throw new Error(`Failed to read episodes CSV: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate date format (YYYY-MM-DD)
 */
function isValidDate(dateString: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) {
    return false;
  }

  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

/**
 * Convert date to ISO 8601 format for Trakt API
 */
function toISO8601(dateString: string): string {
  return `${dateString}T00:00:00.000Z`;
}

/**
 * Validate movies data
 */
function validateMovies(movies: MovieRow[]): ValidationResult {
  const errors: string[] = [];

  movies.forEach((movie, index) => {
    const rowNum = index + 2; // +2 for header row and 0-based index

    if (!movie.title || movie.title.trim() === '') {
      errors.push(`Row ${rowNum}: Missing title`);
    }

    if (!movie.watched_date) {
      errors.push(`Row ${rowNum}: Missing watched_date`);
    } else if (!isValidDate(movie.watched_date)) {
      errors.push(`Row ${rowNum}: Invalid watched_date format. Expected YYYY-MM-DD, got "${movie.watched_date}"`);
    }

    if (movie.year !== undefined && (isNaN(movie.year) || movie.year < 1800 || movie.year > 2100)) {
      errors.push(`Row ${rowNum}: Invalid year "${movie.year}"`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate episodes data
 */
function validateEpisodes(episodes: EpisodeRow[]): ValidationResult {
  const errors: string[] = [];

  episodes.forEach((episode, index) => {
    const rowNum = index + 2; // +2 for header row and 0-based index

    if (!episode.show_name || episode.show_name.trim() === '') {
      errors.push(`Row ${rowNum}: Missing show_name`);
    }

    if (isNaN(episode.season) || episode.season < 0) {
      errors.push(`Row ${rowNum}: Invalid season number "${episode.season}"`);
    }

    if (isNaN(episode.episode) || episode.episode < 1) {
      errors.push(`Row ${rowNum}: Invalid episode number "${episode.episode}"`);
    }

    if (!episode.watched_date) {
      errors.push(`Row ${rowNum}: Missing watched_date`);
    } else if (!isValidDate(episode.watched_date)) {
      errors.push(`Row ${rowNum}: Invalid watched_date format. Expected YYYY-MM-DD, got "${episode.watched_date}"`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Search and Match Functions
// ============================================================================

/**
 * Search for a movie and return match quality
 */
async function searchMovie(
  client: TraktClient,
  row: MovieRow
): Promise<{ matched?: MatchedMovie; ambiguous?: AmbiguousMatch; failed?: FailedMatch }> {
  try {
    const results = await client.search(row.title, 'movie', row.year) as TraktSearchResult[];

    if (!results || results.length === 0) {
      return {
        failed: {
          row,
          type: 'movie',
          reason: 'No matches found',
        },
      };
    }

    // Filter for exact or very close matches
    const goodMatches = results.filter((result) => {
      if (!result.movie) return false;

      const titleMatch = result.movie.title.toLowerCase() === row.title.toLowerCase();
      const yearMatch = !row.year || result.movie.year === row.year;

      return titleMatch && yearMatch;
    });

    if (goodMatches.length === 1) {
      // Perfect match
      return {
        matched: {
          row,
          movie: goodMatches[0].movie!,
          watched_at: toISO8601(row.watched_date),
        },
      };
    } else if (goodMatches.length > 1) {
      // Multiple exact matches (rare but possible)
      return {
        ambiguous: {
          row,
          type: 'movie',
          matches: goodMatches,
          reason: `Found ${goodMatches.length} exact matches`,
        },
      };
    } else if (results.length > 0) {
      // No exact match, but found similar results
      return {
        ambiguous: {
          row,
          type: 'movie',
          matches: results.slice(0, 5), // Top 5 matches
          reason: 'No exact match found, multiple possibilities',
        },
      };
    }

    return {
      failed: {
        row,
        type: 'movie',
        reason: 'No suitable matches found',
      },
    };
  } catch (error) {
    return {
      failed: {
        row,
        type: 'movie',
        reason: `Search error: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

/**
 * Search for an episode and return match quality
 */
async function searchEpisode(
  client: TraktClient,
  row: EpisodeRow
): Promise<{ matched?: MatchedEpisode; ambiguous?: AmbiguousMatch; failed?: FailedMatch }> {
  try {
    // First, search for the show
    const showResults = await client.search(row.show_name, 'show') as TraktSearchResult[];

    if (!showResults || showResults.length === 0) {
      return {
        failed: {
          row,
          type: 'episode',
          reason: 'Show not found',
        },
      };
    }

    // Find exact show match
    const exactShowMatch = showResults.find(
      (result) => result.show && result.show.title.toLowerCase() === row.show_name.toLowerCase()
    );

    const show = exactShowMatch?.show || showResults[0]?.show;

    if (!show) {
      return {
        failed: {
          row,
          type: 'episode',
          reason: 'Show not found',
        },
      };
    }

    // If we didn't get an exact match, it's ambiguous
    if (!exactShowMatch) {
      return {
        ambiguous: {
          row,
          type: 'episode',
          matches: showResults.slice(0, 5),
          reason: `Show name "${row.show_name}" is ambiguous`,
        },
      };
    }

    // Now get the specific episode
    try {
      const episode = await client.searchEpisode(
        show.ids.trakt.toString(),
        row.season,
        row.episode
      ) as TraktEpisode;

      return {
        matched: {
          row,
          show,
          episode,
          watched_at: toISO8601(row.watched_date),
        },
      };
    } catch (error) {
      return {
        failed: {
          row,
          type: 'episode',
          reason: `Episode S${row.season}E${row.episode} not found for show "${show.title}"`,
        },
      };
    }
  } catch (error) {
    return {
      failed: {
        row,
        type: 'episode',
        reason: `Search error: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

/**
 * Search and match all movies in parallel
 */
async function searchAndMatchMovies(
  client: TraktClient,
  movies: MovieRow[],
  spinner?: ora.Ora
): Promise<{ matched: MatchedMovie[]; ambiguous: AmbiguousMatch[]; failed: FailedMatch[] }> {
  const matched: MatchedMovie[] = [];
  const ambiguous: AmbiguousMatch[] = [];
  const failed: FailedMatch[] = [];

  let processed = 0;

  const { succeeded } = await parallelMap(
    movies,
    async (row) => {
      const result = await searchMovie(client, row);
      processed++;
      if (spinner) {
        spinner.text = `Searching movies... ${processed}/${movies.length}`;
      }
      return result;
    },
    {
      maxConcurrency: 5,
      batchSize: 10,
      delayBetweenBatches: 100,
    }
  );

  // Categorize results
  succeeded.forEach((result) => {
    if (result.matched) {
      matched.push(result.matched);
    } else if (result.ambiguous) {
      ambiguous.push(result.ambiguous);
    } else if (result.failed) {
      failed.push(result.failed);
    }
  });

  return { matched, ambiguous, failed };
}

/**
 * Search and match all episodes in parallel
 */
async function searchAndMatchEpisodes(
  client: TraktClient,
  episodes: EpisodeRow[],
  spinner?: ora.Ora
): Promise<{ matched: MatchedEpisode[]; ambiguous: AmbiguousMatch[]; failed: FailedMatch[] }> {
  const matched: MatchedEpisode[] = [];
  const ambiguous: AmbiguousMatch[] = [];
  const failed: FailedMatch[] = [];

  let processed = 0;

  const { succeeded } = await parallelMap(
    episodes,
    async (row) => {
      const result = await searchEpisode(client, row);
      processed++;
      if (spinner) {
        spinner.text = `Searching episodes... ${processed}/${episodes.length}`;
      }
      return result;
    },
    {
      maxConcurrency: 5,
      batchSize: 10,
      delayBetweenBatches: 100,
    }
  );

  // Categorize results
  succeeded.forEach((result) => {
    if (result.matched) {
      matched.push(result.matched);
    } else if (result.ambiguous) {
      ambiguous.push(result.ambiguous);
    } else if (result.failed) {
      failed.push(result.failed);
    }
  });

  return { matched, ambiguous, failed };
}

// ============================================================================
// Import Functions
// ============================================================================

/**
 * Import matched items to Trakt history
 */
async function importToHistory(
  client: TraktClient,
  matched: { movies: MatchedMovie[]; episodes: MatchedEpisode[] }
): Promise<{ added: { movies: number; episodes: number }; not_found: { movies: unknown[]; episodes: unknown[] } }> {
  const payload: {
    movies?: Array<{ watched_at: string; ids: { trakt: number } }>;
    episodes?: Array<{ watched_at: string; ids: { trakt: number } }>;
  } = {};

  if (matched.movies.length > 0) {
    payload.movies = matched.movies.map((m) => ({
      watched_at: m.watched_at,
      ids: { trakt: m.movie.ids.trakt },
    }));
  }

  if (matched.episodes.length > 0) {
    payload.episodes = matched.episodes.map((e) => ({
      watched_at: e.watched_at,
      ids: { trakt: e.episode.ids.trakt },
    }));
  }

  const response = await client.addToHistory(payload);
  return response as { added: { movies: number; episodes: number }; not_found: { movies: unknown[]; episodes: unknown[] } };
}

// ============================================================================
// Reporting Functions
// ============================================================================

/**
 * Generate and display import report
 */
function generateReport(result: ImportResult, dryRun: boolean): void {
  console.log('\n' + chalk.bold.cyan('='.repeat(60)));
  console.log(chalk.bold.cyan(`${dryRun ? '[DRY-RUN] ' : ''}Bulk Import Summary`));
  console.log(chalk.bold.cyan('='.repeat(60)));

  const totalMovies = result.matchedMovies.length;
  const totalEpisodes = result.matchedEpisodes.length;
  const totalAmbiguous = result.ambiguous.length;
  const totalFailed = result.failed.length;

  console.log('\n' + chalk.bold('Results:'));
  console.log(chalk.green(`  ✓ Successfully matched: ${totalMovies + totalEpisodes}`));
  console.log(chalk.green(`    - Movies: ${totalMovies}`));
  console.log(chalk.green(`    - Episodes: ${totalEpisodes}`));

  if (totalAmbiguous > 0) {
    console.log(chalk.yellow(`  ? Ambiguous matches: ${totalAmbiguous}`));
  }

  if (totalFailed > 0) {
    console.log(chalk.red(`  ✗ Failed: ${totalFailed}`));
  }

  // Show API response if available (not dry-run)
  if (result.apiResponse) {
    console.log('\n' + chalk.bold('Import Results:'));
    console.log(chalk.green(`  ✓ Added to history: ${result.apiResponse.added.movies + result.apiResponse.added.episodes}`));
    console.log(chalk.green(`    - Movies: ${result.apiResponse.added.movies}`));
    console.log(chalk.green(`    - Episodes: ${result.apiResponse.added.episodes}`));

    if (result.apiResponse.not_found.movies.length > 0 || result.apiResponse.not_found.episodes.length > 0) {
      console.log(
        chalk.yellow(
          `  ? Not found by API: ${result.apiResponse.not_found.movies.length + result.apiResponse.not_found.episodes.length}`
        )
      );
    }
  }

  // Show sample matches
  if (totalMovies > 0) {
    console.log('\n' + chalk.bold('Sample Movie Matches:'));
    result.matchedMovies.slice(0, 3).forEach((match) => {
      console.log(chalk.green(`  ✓ ${match.movie.title} (${match.movie.year}) [Trakt ID: ${match.movie.ids.trakt}]`));
    });
    if (totalMovies > 3) {
      console.log(chalk.dim(`  ... and ${totalMovies - 3} more`));
    }
  }

  if (totalEpisodes > 0) {
    console.log('\n' + chalk.bold('Sample Episode Matches:'));
    result.matchedEpisodes.slice(0, 3).forEach((match) => {
      console.log(
        chalk.green(
          `  ✓ ${match.show.title} - S${match.row.season}E${match.row.episode} [Episode ID: ${match.episode.ids.trakt}]`
        )
      );
    });
    if (totalEpisodes > 3) {
      console.log(chalk.dim(`  ... and ${totalEpisodes - 3} more`));
    }
  }

  // Show ambiguous matches
  if (totalAmbiguous > 0) {
    console.log('\n' + chalk.bold.yellow('Ambiguous Matches (requires manual review):'));
    result.ambiguous.forEach((amb) => {
      if (amb.type === 'movie') {
        const row = amb.row as MovieRow;
        console.log(chalk.yellow(`  ? ${row.title} (${row.year || 'no year'})`));
      } else {
        const row = amb.row as EpisodeRow;
        console.log(chalk.yellow(`  ? ${row.show_name} S${row.season}E${row.episode}`));
      }
      console.log(chalk.dim(`    Reason: ${amb.reason}`));
      console.log(chalk.dim(`    Found ${amb.matches.length} possible matches`));
    });
  }

  // Show failed matches
  if (totalFailed > 0) {
    console.log('\n' + chalk.bold.red('Failed Matches:'));
    result.failed.forEach((fail) => {
      if (fail.type === 'movie') {
        const row = fail.row as MovieRow;
        console.log(chalk.red(`  ✗ ${row.title} (${row.year || 'no year'})`));
      } else {
        const row = fail.row as EpisodeRow;
        console.log(chalk.red(`  ✗ ${row.show_name} S${row.season}E${row.episode}`));
      }
      console.log(chalk.dim(`    Reason: ${fail.reason}`));
    });
  }

  // Dry-run message
  if (dryRun) {
    console.log('\n' + chalk.bold.blue('[DRY-RUN] No changes were made to your Trakt history.'));
    console.log(chalk.blue('Run without --dry-run to perform the actual import.'));
  }

  console.log(chalk.bold.cyan('\n' + '='.repeat(60) + '\n'));
}

// ============================================================================
// CLI Functions
// ============================================================================

/**
 * Parse command line arguments
 */
function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const result: ParsedArgs = {
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--movies') {
      result.moviesPath = args[++i];
    } else if (arg === '--episodes') {
      result.episodesPath = args[++i];
    }
  }

  return result;
}

/**
 * Display help message
 */
function displayHelp(): void {
  console.log(chalk.bold.cyan('\nTrakt Bulk Import Script\n'));
  console.log('Import historical watch data from CSV files to Trakt.\n');
  console.log(chalk.bold('Usage:'));
  console.log('  npm run bulk-import -- [options]\n');
  console.log(chalk.bold('Options:'));
  console.log('  --movies <path>       Path to movies CSV file');
  console.log('  --episodes <path>     Path to episodes CSV file');
  console.log('  --dry-run            Preview without making changes');
  console.log('  --help, -h           Show this help message\n');
  console.log(chalk.bold('CSV Format:\n'));
  console.log(chalk.bold('Movies (movies.csv):'));
  console.log('  title,year,watched_date');
  console.log('  The Matrix,1999,2024-01-15');
  console.log('  Inception,2010,2024-01-20\n');
  console.log(chalk.bold('Episodes (episodes.csv):'));
  console.log('  show_name,season,episode,watched_date');
  console.log('  Breaking Bad,1,1,2024-01-10');
  console.log('  Stranger Things,4,1,2024-01-15\n');
  console.log(chalk.bold('Examples:'));
  console.log('  npm run bulk-import -- --movies movies.csv --dry-run');
  console.log('  npm run bulk-import -- --episodes episodes.csv');
  console.log('  npm run bulk-import -- --movies movies.csv --episodes episodes.csv\n');
}

// ============================================================================
// Main Function
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    displayHelp();
    process.exit(0);
  }

  if (!args.moviesPath && !args.episodesPath) {
    console.error(chalk.red('Error: Please specify at least one CSV file (--movies or --episodes)'));
    console.log('Run with --help for usage information');
    process.exit(1);
  }

  console.log(chalk.bold.cyan('\n' + '='.repeat(60)));
  console.log(chalk.bold.cyan(`${args.dryRun ? '[DRY-RUN] ' : ''}Trakt Bulk Import`));
  console.log(chalk.bold.cyan('='.repeat(60) + '\n'));

  try {
    // Load configuration and initialize client
    const spinner = ora('Initializing Trakt client...').start();
    const config = loadConfig();
    const oauth = new TraktOAuth(config);

    if (!oauth.isAuthenticated()) {
      spinner.fail('Not authenticated with Trakt.');
      console.log(chalk.yellow('\nPlease authenticate first by running the MCP server.'));
      process.exit(1);
    }

    const client = new TraktClient(config, oauth);
    spinner.succeed('Trakt client initialized');

    // Read and validate CSV files
    let movies: MovieRow[] = [];
    let episodes: EpisodeRow[] = [];

    if (args.moviesPath) {
      spinner.start(`Reading movies from ${args.moviesPath}...`);
      movies = readMoviesCSV(args.moviesPath);
      spinner.succeed(`Read ${movies.length} movies from ${args.moviesPath}`);

      spinner.start('Validating movies data...');
      const validation = validateMovies(movies);
      if (!validation.valid) {
        spinner.fail('Movies validation failed');
        validation.errors.forEach((error) => console.error(chalk.red(`  ✗ ${error}`)));
        process.exit(1);
      }
      spinner.succeed(`Validated ${movies.length} movies`);
    }

    if (args.episodesPath) {
      spinner.start(`Reading episodes from ${args.episodesPath}...`);
      episodes = readEpisodesCSV(args.episodesPath);
      spinner.succeed(`Read ${episodes.length} episodes from ${args.episodesPath}`);

      spinner.start('Validating episodes data...');
      const validation = validateEpisodes(episodes);
      if (!validation.valid) {
        spinner.fail('Episodes validation failed');
        validation.errors.forEach((error) => console.error(chalk.red(`  ✗ ${error}`)));
        process.exit(1);
      }
      spinner.succeed(`Validated ${episodes.length} episodes`);
    }

    // Search and match
    const result: ImportResult = {
      matchedMovies: [],
      matchedEpisodes: [],
      ambiguous: [],
      failed: [],
    };

    if (movies.length > 0) {
      spinner.start(`Searching for ${movies.length} movies...`).start();
      const movieResults = await searchAndMatchMovies(client, movies, spinner);
      result.matchedMovies = movieResults.matched;
      result.ambiguous.push(...movieResults.ambiguous);
      result.failed.push(...movieResults.failed);
      spinner.succeed(`Processed ${movies.length} movies`);
    }

    if (episodes.length > 0) {
      spinner.start(`Searching for ${episodes.length} episodes...`).start();
      const episodeResults = await searchAndMatchEpisodes(client, episodes, spinner);
      result.matchedEpisodes = episodeResults.matched;
      result.ambiguous.push(...episodeResults.ambiguous);
      result.failed.push(...episodeResults.failed);
      spinner.succeed(`Processed ${episodes.length} episodes`);
    }

    // Import to Trakt (if not dry-run)
    if (!args.dryRun && (result.matchedMovies.length > 0 || result.matchedEpisodes.length > 0)) {
      spinner.start('Importing to Trakt history...').start();
      result.apiResponse = await importToHistory(client, {
        movies: result.matchedMovies,
        episodes: result.matchedEpisodes,
      });
      spinner.succeed('Import completed');
    }

    // Generate report
    generateReport(result, args.dryRun);

    // Exit with appropriate code
    if (result.failed.length > 0 || result.ambiguous.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red('\n✗ Fatal error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the script
main();
