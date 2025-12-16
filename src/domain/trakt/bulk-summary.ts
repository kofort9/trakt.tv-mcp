import { TraktClient } from './trakt-client.js';
import { ParsedWatchEntry } from '../../shared/nl-parser.js';
import { DisambiguationOption } from '../../types/trakt.js';

export type SearchStatus = 'resolved' | 'ambiguous' | 'not_found' | 'error';

export interface BulkSummaryEntry {
  index: number;
  rawText: string;
  parsed: ParsedWatchEntry;
  searchStatus: SearchStatus;
  matches?: DisambiguationOption[];
  error?: string;
}

export interface BulkSummary {
  totalEntries: number;
  resolved: number;
  ambiguous: number;
  notFound: number;
  errors: number;
  entries: BulkSummaryEntry[];
}

/**
 * Builds summary tables for bulk operations
 * 
 * Performs parallel searches for all entries and classifies them as:
 * - resolved: Exactly 1 match found
 * - ambiguous: Multiple matches found (requires user selection)
 * - not_found: No matches found
 * - error: Search failed
 */
export class BulkSummaryBuilder {
  constructor(private client: TraktClient) {}

  /**
   * Build summary by searching for all entries
   */
  async buildSummary(
    entries: Array<{ rawText: string; parsed: ParsedWatchEntry }>
  ): Promise<BulkSummary> {
    const summary: BulkSummary = {
      totalEntries: entries.length,
      resolved: 0,
      ambiguous: 0,
      notFound: 0,
      errors: 0,
      entries: [],
    };

    // Process all entries in parallel
    const results = await Promise.allSettled(
      entries.map((entry, index) => this.classifyEntry(entry, index))
    );

    // Collect results
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const entry = result.value;
        summary.entries.push(entry);
        
        // Update counts
        switch (entry.searchStatus) {
          case 'resolved':
            summary.resolved++;
            break;
          case 'ambiguous':
            summary.ambiguous++;
            break;
          case 'not_found':
            summary.notFound++;
            break;
          case 'error':
            summary.errors++;
            break;
        }
      } else {
        // Promise rejected - treat as error
        summary.errors++;
        summary.entries.push({
          index: summary.entries.length,
          rawText: '',
          parsed: {
            title: '',
            type: 'unknown',
            confidence: 'low',
            dateSource: 'fallback',
            watchedAt: new Date().toISOString(),
            isRecallPattern: false,
          },
          searchStatus: 'error',
          error: result.reason?.message || 'Unknown error',
        });
      }
    }

    return summary;
  }

  /**
   * Classify a single entry by searching for it
   */
  private async classifyEntry(
    entry: { rawText: string; parsed: ParsedWatchEntry },
    index: number
  ): Promise<BulkSummaryEntry> {
    const summaryEntry: BulkSummaryEntry = {
      index,
      rawText: entry.rawText,
      parsed: entry.parsed,
      searchStatus: 'error',
    };

    try {
      // Skip low confidence or missing title
      if (entry.parsed.confidence === 'low' || !entry.parsed.title) {
        summaryEntry.searchStatus = 'not_found';
        summaryEntry.error = 'Low confidence or missing title';
        return summaryEntry;
      }

      // Determine search type
      const searchType =
        entry.parsed.type === 'episode'
          ? 'show'
          : entry.parsed.type === 'movie'
            ? 'movie'
            : undefined;

      if (!searchType) {
        summaryEntry.searchStatus = 'error';
        summaryEntry.error = 'Unknown content type';
        return summaryEntry;
      }

      // Search for content
      const searchResults = await this.client.search(
        entry.parsed.title,
        searchType,
        entry.parsed.year,
        { toolName: 'bulk_summary' }
      );

      if (!Array.isArray(searchResults) || searchResults.length === 0) {
        summaryEntry.searchStatus = 'not_found';
        return summaryEntry;
      }

      // Build disambiguation options
      const matches: DisambiguationOption[] = searchResults.slice(0, 3).map((result) => {
        const item = searchType === 'show' ? result.show : result.movie;
        return {
          title: item?.title || 'Unknown',
          year: item?.year,
          traktId: item?.ids.trakt || 0,
          type: searchType === 'show' ? 'show' : 'movie',
          genres: item?.genres,
          overview: item?.overview,
          score: result.score,
        };
      });

      // Classify based on match count
      if (matches.length === 1) {
        summaryEntry.searchStatus = 'resolved';
        summaryEntry.matches = matches;
      } else {
        summaryEntry.searchStatus = 'ambiguous';
        summaryEntry.matches = matches;
      }

      return summaryEntry;
    } catch (error) {
      summaryEntry.searchStatus = 'error';
      summaryEntry.error = error instanceof Error ? error.message : 'Search failed';
      return summaryEntry;
    }
  }

  /**
   * Format summary as a readable table
   */
  formatTable(summary: BulkSummary): string {
    const lines: string[] = [];

    // Header
    lines.push('='.repeat(80));
    lines.push(`BULK SYNC SUMMARY - ${summary.totalEntries} Entries`);
    lines.push('-'.repeat(80));
    lines.push(
      `✓ Resolved: ${summary.resolved} | ⚠️  Ambiguous: ${summary.ambiguous} | ✗ Not Found: ${summary.notFound} | 🔴 Errors: ${summary.errors}`
    );
    lines.push('='.repeat(80));
    lines.push('');

    // Entries
    for (const entry of summary.entries) {
      const statusIcon = this.getStatusIcon(entry.searchStatus);
      const title = this.truncate(entry.parsed.title || entry.rawText, 40);
      const year = entry.parsed.year ? ` (${entry.parsed.year})` : '';
      const episodeInfo =
        entry.parsed.season && entry.parsed.episode
          ? ` S${entry.parsed.season}E${entry.parsed.episode}`
          : '';

      lines.push(`${statusIcon} [${entry.index + 1}] ${title}${year}${episodeInfo}`);

      // Show matches for ambiguous
      if (entry.searchStatus === 'ambiguous' && entry.matches) {
        for (let i = 0; i < entry.matches.length; i++) {
          const match = entry.matches[i];
          const genres = match.genres?.slice(0, 2).join(', ') || '';
          lines.push(`    ${i + 1}. ${match.title} (${match.year || 'N/A'})${genres ? ` - ${genres}` : ''}`);
        }
      }

      // Show error details
      if (entry.error) {
        lines.push(`    Error: ${entry.error}`);
      }

      lines.push('');
    }

    // Footer
    lines.push('='.repeat(80));
    const canProceed = summary.errors === 0;
    lines.push(
      canProceed
        ? '✅ Ready to proceed (no errors)'
        : '❌ Cannot proceed - resolve errors first'
    );
    lines.push('='.repeat(80));

    return lines.join('\n');
  }

  /**
   * Get status icon for entry
   */
  private getStatusIcon(status: SearchStatus): string {
    switch (status) {
      case 'resolved':
        return '✓';
      case 'ambiguous':
        return '⚠️ ';
      case 'not_found':
        return '✗';
      case 'error':
        return '🔴';
    }
  }

  /**
   * Truncate string to max length
   */
  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }
}
