# Cache Implementation

The Trakt.tv MCP server uses an LRU (Least Recently Used) cache to minimize API calls to Trakt.tv and improve performance.

## User Experience Benefits

From a user perspective, the cache provides several benefits:

### Faster Response Times

- **Instant Results**: When you search for a show or movie you've queried before, results appear instantly without waiting for the Trakt API.
- **Reduced Latency**: Frequently accessed data (like your watch history or watchlist) loads immediately from cache rather than making a network request.

### Reduced API Rate Limiting

- **Fewer API Calls**: The cache prevents redundant API requests, keeping you well below Trakt.tv's rate limits.
- **Uninterrupted Service**: You're less likely to hit rate limit errors, even when making multiple queries in quick succession.

### Transparent Operation

- **Automatic**: The cache works automatically in the background—no configuration required.
- **Fresh Data**: Items expire after 1 hour (by default), ensuring you get reasonably up-to-date information.
- **Invisible to Users**: You don't need to worry about cache invalidation or stale data—it's handled automatically.

### Performance Metrics

When using debugging tools, you can see cache performance:

- **Hit Rate**: Shows what percentage of requests were served from cache (higher is better).
- **Memory Usage**: Tracks how much memory the cache is using.
- **Evictions**: Indicates when older items are removed to make room for new ones.

## Features

- **LRU Eviction**: Automatically removes least recently used items when the cache is full.
- **TTL Expiration**: Items expire after a configurable time-to-live (default: 1 hour).
- **Memory Tracking**: Estimates memory usage of cached items to prevent unbounded memory growth.
- **Metrics**: Tracks hits, misses, evictions, and memory usage.

## Memory Management

The cache tracks the estimated size of stored values in bytes.

### Configuration

You can configure memory limits when initializing the cache:

```typescript
const cache = new LRUCache({
  maxSize: 500, // Maximum number of items
  ttlMs: 3600000, // TTL in milliseconds
  maxMemoryBytes: 10 * 1024 * 1024, // Max memory (e.g., 10MB)
  memoryWarningThreshold: 0.9 // Warn when usage exceeds 90%
});
```

### Behavior

1. **Size Estimation**: The size of each entry is estimated based on its type (string length, object keys/values, etc.).
2. **Eviction**:
   - If adding an item would exceed `maxMemoryBytes`, the cache evicts the least recently used items until there is space.
   - If a single item is larger than `maxMemoryBytes`, it is not cached, and a warning is logged.
   - Eviction also occurs if `maxSize` (item count) is exceeded.
3. **Warnings**: A warning is logged to the console if memory usage exceeds `memoryWarningThreshold` * `maxMemoryBytes`.

### Metrics

You can retrieve current memory usage via `getMetrics()` or `getCurrentMemoryUsage()`:

```typescript
const metrics = cache.getMetrics();
console.log(`Memory usage: ${metrics.memoryBytesUsed} bytes`);
console.log(`Average entry size: ${metrics.avgEntrySize} bytes`);
```

## Limitations

### Size Estimation Accuracy

The cache uses a heuristic-based size estimation function that **does not** reflect exact V8 memory usage:

- **Primitive types**: Sizes are approximated (8 bytes for numbers, UTF-8 byte length for strings).
- **Objects and arrays**: Sizes are estimated recursively by summing the sizes of keys and values.
- **V8 overhead not included**: The estimation does not account for V8's internal object overhead, hidden classes, or memory alignment.
- **Circular references**: Detected and handled (contribute 0 bytes to prevent infinite loops).
- **Depth limit**: Nested structures beyond 20 levels deep are not fully measured to prevent stack overflow.

**Implication**: The reported `memoryBytesUsed` metric is an approximation suitable for setting soft limits and monitoring trends, but should not be treated as an exact measurement of actual heap memory consumption.

For precise memory profiling, use Node.js heap snapshots or `process.memoryUsage()`.

