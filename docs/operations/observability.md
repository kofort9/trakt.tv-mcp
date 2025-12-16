# Observability & Tracing

The Trakt MCP server includes Langfuse tracing integration for monitoring, debugging, and optimizing the service. Langfuse provides AI-native observability specifically designed for LLM applications and MCP servers.

## Langfuse Quickstart (copy/paste)

```bash
# 1) Grab keys from Langfuse (Settings → API Keys)
export LANGFUSE_SECRET_KEY="sk-lf-..."
export LANGFUSE_PUBLIC_KEY="pk-lf-..."
# Optional if self-hosting (defaults to cloud):
export LANGFUSE_BASE_URL="https://cloud.langfuse.com"

# 2) Run anything that exercises the MCP tools to emit traces
npm run build && node dist/index.js
# or launch via your MCP host, e.g. in Claude Desktop's mcpServers config

# 3) Open Langfuse → Traces to confirm entries like mcp.tool.search_show
```

## Why Langfuse?

After initially implementing OpenTelemetry with Honeycomb, the project migrated to Langfuse for several key reasons:

### AI/LLM-Native Tracing
- **Purpose-built for AI applications**: Langfuse understands prompts, completions, and agent interactions out of the box
- **MCP-aware**: Better visibility into tool calls, parameters, and results specific to Model Context Protocol
- **Prompt engineering insights**: Track how natural language queries are processed and disambiguated

### Simpler Infrastructure
- **No collector required**: Direct SDK integration without OpenTelemetry Collector infrastructure
- **Faster setup**: From zero to traced in minutes (just API keys)
- **Lower operational overhead**: Managed service handles all storage and visualization

### Better Visibility
- **Structured traces**: Automatic organization by session, tool call, and API request
- **Rich metadata**: Input/output logging optimized for debugging AI interactions
- **NLP-specific events**: Track search ambiguity, fuzzy matching, and disambiguation

### Cost Efficiency
- **Generous free tier**: Suitable for personal projects and small teams
- **Predictable pricing**: Based on trace volume, not infrastructure
- **Self-hosted option**: Can run your own Langfuse instance if needed

### Graceful Degradation
- **Zero dependencies when disabled**: No performance impact without API keys
- **Fail-safe operation**: Server continues working even if tracing fails
- **Optional feature**: Tracing is completely opt-in

## Features

### 1. MCP Tool Tracing

Every MCP tool invocation is automatically traced with:

- **Tool name and parameters** (sanitized for privacy)
- **Execution duration** (automatic timing)
- **Success/failure status** with error details
- **Result summary** (counts, types, truncated for large responses)

Example trace attributes:
```json
{
  "name": "mcp.tool.search_episode",
  "input": {
    "showName": "Breaking Bad",
    "season": 1,
    "episode": 1
  },
  "output": {
    "type": "episode",
    "success": true
  },
  "metadata": {
    "duration_ms": 152,
    "success": true
  }
}
```

### 2. Trakt API Instrumentation

All Trakt API calls are traced as nested spans with:

- **HTTP method and endpoint** (sanitized for low cardinality)
- **Response metadata** (success/failure, duration)
- **Error details** when requests fail
- **Result summaries** for debugging

Example API span:
```json
{
  "name": "trakt.api",
  "input": {
    "method": "GET",
    "endpoint": "/search/show"
  },
  "metadata": {
    "duration_ms": 145,
    "http_method": "GET",
    "http_endpoint": "/search/show",
    "success": true
  }
}
```

### 3. Cache Operations

Cache behavior is tracked via events within tool traces:

- **Cache hit/miss indicators** with cache keys (truncated for readability)
- **Tool association** linking cache events to specific operations

Example cache event:
```json
{
  "name": "cache.hit",
  "metadata": {
    "cache_key": "search:show:breaking bad",
    "tool_name": "search_show"
  }
}
```

### 4. NLP Ambiguity Tracking

Specialized events track natural language processing patterns:

#### Search Ambiguity
Tracks when searches return multiple results requiring disambiguation:
```typescript
logAmbiguity(
  'The Office',
  2,  // US and UK versions
  true,  // needs clarification
  'exact'  // match type
);
```

Event attributes:
```json
{
  "name": "nlp.ambiguity",
  "input": {
    "query": "The Office"
  },
  "metadata": {
    "match_count": 2,
    "needs_clarification": true,
    "match_type": "exact",
    "ambiguity_level": "medium"
  }
}
```

**Ambiguity levels**:
- `none`: 0 matches
- `low`: 1 match (unambiguous)
- `medium`: 2-5 matches
- `high`: 6+ matches

**Match types**:
- `exact`: Precise title match
- `fuzzy`: Close match with typos/variations
- `partial`: Substring or incomplete match
- `none`: No matches found

## Configuration

### Environment Variables

```bash
# Required: Langfuse API keys
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_PUBLIC_KEY=pk-lf-...

# Optional: Langfuse instance URL (defaults to cloud)
LANGFUSE_BASE_URL=https://cloud.langfuse.com

# Optional: Enable debug logging
LANGFUSE_DEBUG=true
```

### Getting Langfuse API Keys

#### Option 1: Langfuse Cloud (Recommended)

1. Sign up at [cloud.langfuse.com](https://cloud.langfuse.com)
2. Create a new project or use existing
3. Go to **Settings** → **API Keys**
4. Create a new key pair (public + secret)
5. Add to your `.env` file or shell profile

#### Option 2: Self-Hosted Langfuse

1. Deploy Langfuse using Docker or Kubernetes ([docs](https://langfuse.com/docs/deployment/self-host))
2. Access your instance and create a project
3. Generate API keys from project settings
4. Set `LANGFUSE_BASE_URL` to your instance URL

### Setup Example

```bash
# Add to .env
cat >> .env << EOF
LANGFUSE_SECRET_KEY=sk-lf-your-secret-key-here
LANGFUSE_PUBLIC_KEY=pk-lf-your-public-key-here
LANGFUSE_BASE_URL=https://cloud.langfuse.com
EOF

# Or add to shell profile (persistent across sessions)
echo 'export LANGFUSE_SECRET_KEY="sk-lf-your-secret-key-here"' >> ~/.zshrc
echo 'export LANGFUSE_PUBLIC_KEY="pk-lf-your-public-key-here"' >> ~/.zshrc
source ~/.zshrc
```

## Using Langfuse

### Trace Structure

Traces are organized hierarchically:

```
mcp-session (trace)
  ├─ mcp.tool.search_show (span)
  │   ├─ trakt.api (span)
  │   └─ cache.hit (event)
  ├─ nlp.ambiguity (event)
  └─ mcp.tool.log_watch (span)
      └─ trakt.api (span)
```

### Viewing Traces

In the Langfuse UI:

1. **Traces View**: See all MCP sessions with tool calls
2. **Span Details**: Drill into individual operations
3. **Input/Output**: Review parameters and results
4. **Metadata**: Analyze duration, success rates, errors
5. **Events**: Track cache operations and NLP patterns

### Example Queries

Langfuse provides powerful filtering and aggregation:

#### Find Slow Tool Operations
```
Filter: name = "mcp.tool.*"
Sort: metadata.duration_ms DESC
```

#### Track Cache Effectiveness
```
Filter: name = "cache.hit" OR name = "cache.miss"
Group by: tool_name
```

#### Analyze Search Ambiguity
```
Filter: name = "nlp.ambiguity"
Group by: metadata.ambiguity_level
```

#### Error Rate Monitoring
```
Filter: level = "ERROR"
Group by: name
Count by day
```

### Useful Dashboards

**Performance Dashboard**:
- P50, P95, P99 latencies by tool
- Tool call volume over time
- Error rates and types

**NLP Dashboard**:
- Search ambiguity frequency
- Match type distribution
- Disambiguation success rate

**API Health Dashboard**:
- Trakt API call success rates
- Response times
- Error patterns

## Privacy & Security

### Data Sanitization

The tracing system automatically protects sensitive data:

**Result Truncation**:
- Strings >500 characters are truncated with "...[truncated]" suffix
- Large arrays show only length and first 3 items
- Complex objects are summarized to prevent data leakage

**Example**:
```typescript
// Large result
{ results: [/* 50 items */] }

// Sent to Langfuse
{
  type: "array",
  length: 50,
  sample: [item1, item2, item3]
}
```

### What We DO NOT Collect

The instrumentation avoids collecting:
- User authentication tokens (never passed to tracing)
- Personal viewing history details (only aggregated metrics)
- Complete API responses (truncated/summarized)
- Trakt API credentials

### What We DO Collect

For debugging and optimization:
- Tool names and sanitized parameters
- Search queries and episode identifiers
- Success/failure indicators
- Timing and performance metrics
- Error messages (without sensitive context)

## Performance Impact

Tracing is designed for minimal overhead:

- **<5ms per operation** on average
- **Async operation** - tracing does not block tool execution
- **Graceful degradation** - completely disabled without API keys
- **Efficient span creation** - only when tracing is enabled

Performance comparison (before/after tracing):
```
Search operation (cached):    ~2ms  → ~2.5ms   (+25%)
Search operation (uncached):  ~150ms → ~152ms  (+1.3%)
Tool invocation overhead:     ~1ms  → ~2ms     (+1ms)
```

## Troubleshooting

### Tracing Not Working

1. **Check API keys are set**:
   ```bash
   echo $LANGFUSE_SECRET_KEY
   echo $LANGFUSE_PUBLIC_KEY
   ```

2. **Verify initialization in logs**:
   Look for stderr message:
   ```
   [LANGFUSE] Initialized successfully (baseUrl: https://cloud.langfuse.com)
   ```

3. **Enable debug mode**:
   ```bash
   export LANGFUSE_DEBUG=true
   ```

### No Data in Langfuse

1. **Check API key validity** in Langfuse project settings
2. **Verify baseUrl** matches your instance (cloud vs self-hosted)
3. **Wait 10-30 seconds** for async flush to complete
4. **Check for errors** in stderr output
5. **Verify project is active** and not archived

### Trace Data Missing

If traces appear but lack detail:

1. **Check span creation** - ensure tools are wrapped with `traceToolCall()`
2. **Verify currentTrace** is set at session start
3. **Review flush timing** - traces flush on `endTrace()` or `shutdown()`

### Performance Issues

If tracing causes performance problems:

1. **Disable temporarily**:
   ```bash
   unset LANGFUSE_SECRET_KEY
   unset LANGFUSE_PUBLIC_KEY
   ```

2. **Reduce trace volume** (future feature):
   ```bash
   export LANGFUSE_SAMPLING_RATE=0.1  # 10% sampling
   ```

3. **Check network latency** to Langfuse instance

## Development

### Testing Tracing

Tracing works with or without Langfuse configured:

```bash
# Test without tracing (should work identically)
npm test

# Test with tracing enabled (requires API keys)
export LANGFUSE_SECRET_KEY=sk-lf-test-key
export LANGFUSE_PUBLIC_KEY=pk-lf-test-key
npm test
```

### Adding Tracing to a New Tool

Wrap tool operations in `traceToolCall()`:

```typescript
import { traceToolCall } from './langfuse.js';

export async function myNewTool(client: TraktClient, args: MyArgs) {
  return await traceToolCall('my_new_tool', args, async () => {
    // Your tool logic here
    const result = await doWork();
    return result;
  });
}
```

The function automatically:
- Creates a span with tool name and parameters
- Records execution duration
- Captures errors with proper error levels
- Summarizes results before logging

### Adding API Call Tracing

Wrap Trakt API calls in `traceApiCall()`:

```typescript
import { traceApiCall } from './langfuse.js';

async function fetchData() {
  return await traceApiCall('GET', '/my/endpoint', async () => {
    const response = await axios.get('/my/endpoint');
    return response.data;
  });
}
```

### Logging NLP Events

Track ambiguity in search results:

```typescript
import { logAmbiguity } from './langfuse.js';

if (results.length > 1) {
  logAmbiguity(
    query,
    results.length,
    !hasDisambiguationHint,
    'exact'
  );
}
```

### Logging Cache Events

Track cache hits and misses:

```typescript
import { logCacheEvent } from './langfuse.js';

const cached = cache.get(key);
if (cached) {
  logCacheEvent('hit', key, 'search_show');
  return cached;
} else {
  logCacheEvent('miss', key, 'search_show');
  // Fetch from API...
}
```

## Architecture

### Initialization Flow

```
index.ts (startup)
  ↓
langfuse.ts initialization (lazy)
  ↓
getLangfuse() checks env vars
  ↓
Langfuse SDK initialized (or null if keys missing)
```

### Trace Lifecycle

```
startTrace() - Begin MCP session
  ↓
traceToolCall() - Wrap tool operations
  ├─ traceApiCall() - Wrap API requests
  └─ logAmbiguity() - Log NLP events
  ↓
endTrace() - Flush and close session
```

### Module Structure

```
src/core/langfuse.ts           # Langfuse integration (all-in-one)
src/domain/trakt/tools.ts      # MCP tools (traced)
src/domain/trakt/trakt-client.ts # API client (traced)
src/domain/trakt/cache.ts      # Cache (logged via events)
```

### Graceful Degradation

When Langfuse is not configured:

1. `isEnabled()` returns `false`
2. All tracing functions check enabled state and return early
3. Operations proceed without tracing overhead
4. Zero performance impact

```typescript
// Using the class-based tracer
const tracer = createLangfuseTracer();

if (!tracer.isEnabled()) {
  // No API keys configured - operations work without tracing
}

// Or using the default singleton (backward compatible)
import { traceToolCall, isLangfuseEnabled } from './langfuse.js';

if (!isLangfuseEnabled()) {
  // Tracing disabled
}

// traceToolCall automatically handles disabled state
const result = await traceToolCall('my_tool', params, operation);
```

### Class-Based Architecture

The Langfuse integration uses a class-based pattern for better testability:

```typescript
import { createLangfuseTracer, LangfuseTracer } from './langfuse.js';

// Create a tracer instance (can inject config for testing)
const tracer = createLangfuseTracer({
  secretKey: 'sk-lf-...',
  publicKey: 'pk-lf-...',
  baseUrl: 'https://cloud.langfuse.com'
});

// Or use default singleton (reads from env vars)
import { defaultTracer } from './langfuse.js';
```

This enables:
- **Test isolation**: Create separate tracers per test without shared state
- **Dependency injection**: Pass tracer instances to functions
- **Multiple instances**: Support different Langfuse projects simultaneously
- **Backward compatibility**: Existing code using function exports continues to work

## Future Enhancements

Planned improvements:

- [ ] Sampling rate configuration for high-volume deployments
- [ ] Automatic anomaly detection integration
- [ ] Custom metadata for user sessions
- [ ] Integration with Langfuse Prompt Management
- [ ] Cost tracking per tool/API call
- [ ] A/B testing support for NLP disambiguation strategies

## Migration from OpenTelemetry

This project originally used OpenTelemetry with Honeycomb. The migration to Langfuse simplified the architecture while improving AI-specific observability:

**What Changed**:
- Removed OpenTelemetry SDK dependencies
- Removed OTLP exporter configuration
- Simplified configuration (no collector needed)
- Improved AI-native trace visualization

**What Stayed the Same**:
- Same tracing coverage (tools, API, cache, NLP)
- Same privacy protections (sanitization, truncation)
- Same graceful degradation behavior
- Same performance characteristics

**For Existing Users**:
If you were using OpenTelemetry:
1. Remove old environment variables: `HONEYCOMB_API_KEY`, `OTEL_SERVICE_NAME`, `OTEL_ENABLED`
2. Add Langfuse keys: `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`
3. Restart the server - tracing continues automatically

## References

- [Langfuse Documentation](https://langfuse.com/docs)
- [Langfuse Tracing Guide](https://langfuse.com/docs/tracing)
- [Langfuse Self-Hosting](https://langfuse.com/docs/deployment/self-host)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Trakt API Documentation](https://trakt.docs.apiary.io/)
