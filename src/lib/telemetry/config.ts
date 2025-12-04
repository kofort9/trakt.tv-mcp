/**
 * OpenTelemetry Configuration
 *
 * Initializes OpenTelemetry instrumentation for the Trakt MCP server.
 * Sends traces to Honeycomb for observability and debugging.
 *
 * Features:
 * - Automatic trace export to Honeycomb via OTLP/HTTP
 * - Graceful degradation when telemetry is disabled
 * - Environment-based configuration
 * - Service name and resource attributes
 *
 * Environment Variables:
 * - HONEYCOMB_API_KEY: Required for trace export
 * - OTEL_SERVICE_NAME: Service name (default: "trakt-mcp-server")
 * - OTEL_ENABLED: Enable/disable telemetry (default: true if API key present)
 * - OTEL_SAMPLING_RATE: Sampling rate 0.0-1.0 (default: 1.0)
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

let sdk: NodeSDK | null = null;
let telemetryEnabled = false;

/**
 * Initialize OpenTelemetry SDK with Honeycomb exporter
 *
 * This function should be called once at server startup, before any other imports
 * that might create spans. It configures the global tracer provider and sets up
 * automatic trace export to Honeycomb.
 *
 * @returns true if telemetry was successfully initialized, false otherwise
 *
 * @example
 * ```typescript
 * import { initTelemetry } from './lib/telemetry/config.js';
 *
 * // Call at the very top of your main file
 * initTelemetry();
 * ```
 */
export function initTelemetry(): boolean {
  // Check if already initialized
  if (sdk !== null) {
    console.error('[Telemetry] Already initialized');
    return telemetryEnabled;
  }

  // Check if explicitly disabled
  const explicitlyDisabled = process.env.OTEL_ENABLED === 'false';
  if (explicitlyDisabled) {
    console.log('[Telemetry] Disabled via OTEL_ENABLED=false');
    return false;
  }

  // Check for Honeycomb API key
  const apiKey = process.env.HONEYCOMB_API_KEY;
  if (!apiKey) {
    console.log('[Telemetry] Disabled (no HONEYCOMB_API_KEY)');
    return false;
  }

  try {
    // Enable diagnostic logging in development
    if (process.env.NODE_ENV === 'development' || process.env.OTEL_DEBUG === 'true') {
      diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
    }

    // Configure OTLP exporter for Honeycomb
    const traceExporter = new OTLPTraceExporter({
      url: 'https://api.honeycomb.io/v1/traces',
      headers: {
        'x-honeycomb-team': apiKey,
      },
    });

    // Configure service resource
    const serviceName = process.env.OTEL_SERVICE_NAME || 'trakt-mcp-server';
    const resource = new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
    });

    // Initialize SDK
    sdk = new NodeSDK({
      resource,
      traceExporter,
    });

    // Start SDK
    sdk.start();
    telemetryEnabled = true;

    console.log(`[Telemetry] Initialized successfully (service: ${serviceName})`);

    // Handle graceful shutdown
    process.on('SIGTERM', () => {
      shutdownTelemetry();
    });

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Telemetry] Failed to initialize: ${errorMessage}`);
    telemetryEnabled = false;
    return false;
  }
}

/**
 * Shut down OpenTelemetry SDK gracefully
 *
 * Ensures all pending spans are exported before the process exits.
 * Called automatically on SIGTERM, but can be called manually for testing.
 */
export async function shutdownTelemetry(): Promise<void> {
  if (sdk !== null) {
    try {
      await sdk.shutdown();
      console.log('[Telemetry] Shutdown complete');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Telemetry] Error during shutdown: ${errorMessage}`);
    } finally {
      sdk = null;
      telemetryEnabled = false;
    }
  }
}

/**
 * Check if telemetry is currently enabled
 *
 * @returns true if telemetry is initialized and active
 */
export function isTelemetryEnabled(): boolean {
  return telemetryEnabled;
}
