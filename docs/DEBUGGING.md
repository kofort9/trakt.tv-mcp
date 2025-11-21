# Debugging Guide - Trakt.tv MCP Server

This guide explains how to use the built-in debugging tools and log analysis features to troubleshoot issues with the Trakt.tv MCP server.

## Overview

The server includes a comprehensive logging and debugging system that tracks:
- API requests and responses (method, URL, headers, body)
- Performance metrics (duration, success/failure rates)
- Rate limit status
- Error details
- Request correlation

## The Debug Tool (`debug_last_request`)

The primary tool for troubleshooting is `debug_last_request`. It allows you to inspect recent API activity directly through the MCP interface.

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 10 | Number of recent logs to retrieve (max 100) |
| `toolName` | string | - | Filter logs by specific tool name |
| `method` | string | - | Filter by HTTP method (GET, POST, etc.) |
| `statusCode` | number | - | Filter by specific HTTP status code |
| `errorsOnly` | boolean | false | Show only requests with status code >= 400 |
| `includeMetrics` | boolean | true | Include performance metrics in output |

### Usage Examples

#### 1. Basic Status Check
View the last 5 requests to verify the server is communicating with Trakt.tv:

```json
{
  "name": "debug_last_request",
  "arguments": {
    "limit": 5
  }
}
```

#### 2. finding Errors
Quickly find recent failed requests:

```json
{
  "name": "debug_last_request",
  "arguments": {
    "errorsOnly": true,
    "limit": 20
  }
}
```

#### 3. Troubleshooting a Specific Tool
Isolate issues with the search functionality:

```json
{
  "name": "debug_last_request",
  "arguments": {
    "toolName": "search_show",
    "limit": 10
  }
}
```

#### 4. Analyzing Performance
Check latency and success rates:

```json
{
  "name": "debug_last_request",
  "arguments": {
    "includeMetrics": true,
    "limit": 0
  }
}
```

## Common Troubleshooting Scenarios

### 1. Rate Limit Issues

Trakt.tv enforces a rate limit of 1000 requests per 5 minutes. To check your status:

1. Run `debug_last_request` with `limit: 1`.
2. Inspect the `rateLimitInfo` object in the log entry:
   ```json
   "rateLimitInfo": {
     "limit": "1000",
     "remaining": "998",
     "reset": "1700000000"
   }
   ```
3. If `remaining` is low, wait until the `reset` timestamp (Unix epoch).

### 2. Authentication Failures

If requests are failing with 401 (Unauthorized) or 403 (Forbidden):

1. Run `debug_last_request` with `statusCode: 401` (or 403).
2. Check the `error` field in the log.
3. **Solution**: The OAuth token may have expired or been revoked. Restart the MCP server to trigger the authentication flow again.

### 3. API Errors (500s)

If you encounter 500, 502, 503, or 504 errors:

1. Use `errorsOnly: true` to find the failed requests.
2. Check the `responseBody` for error messages from Trakt.
3. Note the `correlationId` to track related retries.
4. **Solution**: These are usually temporary Trakt.tv server issues. Wait a few minutes and try again.

## Log Files

The server writes logs to disk for persistent storage and deep analysis.

### Location
By default, logs are stored in a secure user-specific directory:
- **Linux/macOS**: `~/.trakt-mcp/logs/`
- **Windows**: `%USERPROFILE%\.trakt-mcp\logs\`

Files are named with timestamps: `trakt-mcp-YYYY-MM-DDTHH-mm-ss.log`.

### Security & Retention
- **Permissions**: The log directory is set to `700` (owner only) and log files to `600` (owner read/write).
- **Retention**: Logs older than 7 days are automatically deleted on server startup.

### Format
Logs are written in **JSON Lines** format (one JSON object per line). Each entry contains:

```json
{
  "correlationId": "1700000000000-1",
  "timestamp": "2025-11-21T10:00:00.000Z",
  "toolName": "search_movie",
  "method": "GET",
  "url": "https://api.trakt.tv/search/movie?query=dune",
  "headers": { "Authorization": "[REDACTED]", ... },
  "statusCode": 200,
  "durationMs": 145,
  "responseBody": { ... }
}
```

### Correlation IDs
Each request is assigned a unique `correlationId` (e.g., `1700000000000-1`). This ID helps you:
- Track retries of the same operation.
- Correlate requests triggered by a single user action.
- Reference specific requests when reporting bugs.

## Performance Profiling

The `metrics` output from `debug_last_request` provides aggregated statistics for each tool:

```json
{
  "toolName": "search_movie",
  "totalCalls": 15,
  "successfulCalls": 14,
  "failedCalls": 1,
  "avgDurationMs": 120.5,
  "minDurationMs": 85,
  "maxDurationMs": 450,
  "lastExecuted": "2025-11-21T10:00:00.000Z"
}
```

**Best Practices:**
- Monitor `avgDurationMs` to identify slow operations.
- Watch `failedCalls` to detect instability.
- Compare `minDurationMs` vs `maxDurationMs` to see latency variance.

