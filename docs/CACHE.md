# Cache Implementation

The Trakt.tv MCP server uses an LRU (Least Recently Used) cache to minimize API calls to Trakt.tv and improve performance.

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
console.log(`Memory usage: ${metrics.memoryUsage} bytes`);
```

