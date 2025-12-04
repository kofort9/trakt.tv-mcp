# Observability & Telemetry

The Trakt MCP server includes comprehensive OpenTelemetry instrumentation for monitoring, debugging, and optimizing the service. Telemetry data is exported to [Honeycomb](https://honeycomb.io) for analysis and visualization.

## Features

### 1. MCP Tool Tracing

Every MCP tool invocation is automatically traced with:

- **Tool name and parameters** (sensitive data sanitized)
- **Execution duration** (automatic)
- **Success/failure status** with error details
- **Result metadata** (counts, types, etc.)

Example span attributes:
```
mcp.tool.name: "search_episode"
mcp.tool.param.showName: "Breaking Bad"
mcp.tool.param.season: 1
mcp.tool.param.episode: 1
mcp.tool.result.success: true
mcp.tool.result.type: "episode"
```

### 2. Trakt API Instrumentation

All Trakt API calls are traced with:

- **HTTP method and endpoint** (sanitized for low cardinality)
- **Response status code and size**
- **Rate limit information** from response headers
  - Current usage percentage
  - Remaining requests
  - Reset timestamp
  - Warning when approaching limit (>90%)
- **Retry attempts** with backoff delays
- **Cache hit/miss events** with cache keys

Example span attributes:
```
http.method: "GET"
http.url: "/search/show"
http.status_code: 200
trakt.search.query: "Breaking Bad"
trakt.rate_limit.usage_percent: 15
trakt.rate_limit.remaining: 850
cache.hit: true
```

### 3. Cache Operations

Cache behavior is tracked at two levels:

**Inline Attributes** (added to existing spans):
- Cache hit/miss indicators
- Hit counts per entry
- Expiry reasons (e.g., TTL expired)

**Prune Operations**:
- Entries removed
- Memory freed
- Cache size before/after

Example:
```
cache.hit: true
cache.entry_hits: 5
cache.prune.entries_removed: 12
cache.prune.memory_freed: 1048576
```

### 4. NLP Event Tracking

Specialized events track natural language processing patterns:

#### Search Ambiguity
Tracks when searches return multiple results requiring disambiguation:
```typescript
trackSearchAmbiguity(
  query: 'The Office',
  matches: 2,  // US and UK versions
  needsClarification: true,
  matchType: 'exact'
);
```

Attributes:
- `nlp.query`: The search query
- `nlp.match_count`: Number of matches
- `nlp.needs_clarification`: Boolean
- `nlp.ambiguity_level`: "low" | "medium" | "high"

#### Fuzzy Matching
Records fuzzy match confidence scores:
```typescript
trackFuzzyMatch(
  query: 'Breaking Badd',  // User typo
  result: 'Breaking Bad',
  score: 0.92  // High confidence despite typo
);
```

#### Query Complexity
Analyzes search query characteristics:
```typescript
trackQueryComplexity('Star Wars Episode IV: A New Hope (1977)');
```

Detects:
- Word count
- Presence of years `(1977)`
- Special characters
- Parentheses
- Overall complexity level

#### Search Quality
Evaluates search result quality:
```typescript
trackSearchQuality(
  query: 'Breaking Bad',
  resultCount: 1,
  topMatchScore: 0.95,
  averageScore: 0.95
);
```

Categories: `excellent`, `good`, `fair`, `too_many_results`, `no_results`

## Configuration

### Environment Variables

```bash
# Required: Honeycomb API key
HONEYCOMB_API_KEY=your_api_key_here

# Optional: Service name (default: "trakt-mcp-server")
OTEL_SERVICE_NAME=trakt-mcp-server

# Optional: Enable/disable telemetry (default: true if API key present)
OTEL_ENABLED=true

# Optional: Debug mode for verbose telemetry logging
OTEL_DEBUG=true
```

### Getting a Honeycomb API Key

1. Sign up at [honeycomb.io](https://honeycomb.io)
2. Create a new environment (or use existing)
3. Go to **Account Settings** → **API Keys**
4. Create a new **Ingest API Key**
5. Add to your `.env` file or `~/.zshrc`

### Setup Example

```bash
# Add to .env
echo "HONEYCOMB_API_KEY=your_key_here" >> .env

# Or add to shell profile (persistent across sessions)
echo 'export HONEYCOMB_API_KEY="your_key_here"' >> ~/.zshrc
source ~/.zshrc
```

## Using Honeycomb

### Example Queries

#### Find slow tool operations
```
AVG(duration_ms) > 1000
GROUP BY mcp.tool.name
```

#### Identify high cache miss rates
```
WHERE cache.miss = true
GROUP BY trakt.search.query
COUNT
```

#### Track API rate limit usage
```
P99(trakt.rate_limit.usage_percent)
GROUP BY trakt.api_version
```

#### Analyze search ambiguity patterns
```
WHERE nlp.needs_clarification = true
GROUP BY nlp.ambiguity_level
COUNT
```

#### Find retry attempts
```
WHERE EXISTS(trakt.retry.attempt)
GROUP BY http.url
MAX(trakt.retry.attempt)
```

### Useful Dashboards

**Performance Dashboard**:
- P50, P95, P99 latencies by tool
- API call success rates
- Cache hit rates

**NLP Dashboard**:
- Search ambiguity frequency
- Query complexity distribution
- Fuzzy match confidence trends

**Health Dashboard**:
- API rate limit usage trends
- Error rates by error code
- Retry frequency

## Privacy & Security

### Data Sanitization

The telemetry system automatically sanitizes sensitive data:

**Sensitive Parameters** (redacted):
- `token`, `accessToken`, `refreshToken`
- `apiKey`, `clientSecret`
- `password`, `secret`

**Long Strings** (truncated):
- Strings >500 characters are truncated with "... (truncated)" suffix

**Example**:
```typescript
// Input
{ query: 'Breaking Bad', token: 'secret-token-123' }

// Sent to Honeycomb
{ query: 'Breaking Bad', token: '[REDACTED]' }
```

### No PII Collection

The instrumentation does NOT collect:
- User email addresses
- IP addresses
- Authentication credentials
- Personal viewing history details (only aggregated metrics)

## Performance Impact

Telemetry is designed for minimal overhead:

- **<5ms per operation** on average
- **Async export** - no blocking of requests
- **Graceful degradation** - disabled if HONEYCOMB_API_KEY not set
- **Efficient span creation** - only when telemetry enabled

Benchmarks (before/after telemetry):
```
Search operation (cached):    ~2ms  → ~2.3ms  (+15%)
Search operation (uncached):  ~150ms → ~152ms  (+1.3%)
Tool invocation overhead:     ~1ms  → ~3ms    (+2ms)
```

## Troubleshooting

### Telemetry Not Working

1. **Check API key is set**:
   ```bash
   echo $HONEYCOMB_API_KEY
   ```

2. **Verify telemetry initialization**:
   Look for log message:
   ```
   [Telemetry] Initialized successfully (service: trakt-mcp-server)
   ```

3. **Enable debug mode**:
   ```bash
   export OTEL_DEBUG=true
   ```

### No Data in Honeycomb

1. **Check environment name** matches your Honeycomb setup
2. **Verify API key permissions** (needs "Send Events")
3. **Wait 30-60 seconds** for first data to appear
4. **Check for errors** in console output

### High Memory Usage

If telemetry causes memory issues:

1. **Reduce sampling rate** (future feature):
   ```bash
   export OTEL_SAMPLING_RATE=0.1  # 10% sampling
   ```

2. **Disable telemetry temporarily**:
   ```bash
   export OTEL_ENABLED=false
   ```

3. **Check for span leaks** (report as bug if found)

## Development

### Testing Telemetry

Run telemetry-specific tests:
```bash
npm test -- src/lib/__tests__/telemetry
```

### Adding New Instrumentation

#### Instrument a new MCP tool:
```typescript
import { traceMcpTool, addToolParams } from './telemetry/mcp-tracer.js';

export async function myNewTool(client: TraktClient, args: MyArgs) {
  return await traceMcpTool('my_new_tool', async (span) => {
    // Add parameters to span
    addToolParams(span, args);

    // Your tool logic here
    const result = await doWork();

    // Add result metadata
    span.setAttribute('mcp.tool.result.success', true);
    span.setAttribute('mcp.tool.result.count', result.length);

    return result;
  });
}
```

#### Track a new NLP pattern:
```typescript
import { trackSearchAmbiguity } from './telemetry/nlp-events.js';

// In your search logic
if (results.length > 1) {
  trackSearchAmbiguity(
    query,
    results.length,
    !hasDisambiguationHint,
    'exact',
    { 'custom.attribute': 'value' }
  );
}
```

#### Add API call tracing:
```typescript
import { traceTraktApiCall, addCacheInfo } from './telemetry/trakt-tracer.js';

async function myApiCall() {
  return await traceTraktApiCall('GET', '/my/endpoint', async (span) => {
    // Check cache
    const cached = cache.get(key);
    if (cached) {
      addCacheInfo(span, true, key);
      return cached;
    }

    // Make API call
    const result = await axios.get('/my/endpoint');
    return result.data;
  });
}
```

## Architecture

### Initialization Flow

```
index.ts (startup)
  ↓
initTelemetry()
  ↓
NodeSDK.start()
  ↓
OTLPTraceExporter → Honeycomb
```

### Span Hierarchy

```
mcp.tool.search_episode (root span)
  ├─ trakt.api.get./search/show (API call)
  │   └─ cache.get (cache check)
  └─ trakt.api.get./shows/{slug}/seasons/{season}/episodes/{episode}
      └─ cache.get (cache check)
```

### Module Structure

```
src/lib/telemetry/
├── config.ts           # OpenTelemetry SDK initialization
├── mcp-tracer.ts       # MCP tool tracing utilities
├── trakt-tracer.ts     # Trakt API tracing utilities
└── nlp-events.ts       # NLP event tracking
```

## Future Enhancements

Planned improvements:

- [ ] Metrics export (cache hit rate, error rate, etc.)
- [ ] Sampling rate configuration
- [ ] Custom span processors for advanced filtering
- [ ] Trace correlation with user sessions
- [ ] Performance budgets with alerts
- [ ] Automatic anomaly detection integration

## References

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Honeycomb Guide](https://docs.honeycomb.io/)
- [Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
- [Trakt API Rate Limits](https://trakt.docs.apiary.io/#introduction/rate-limiting)
