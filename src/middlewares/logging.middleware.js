/**
 * Request logging middleware
 *
 * Logs every incoming request with:
 * - HTTP method and path
 * - Response status code
 * - Response time (in ms)
 *
 * Useful for debugging, monitoring, and auditing.
 * Should be registered early in the middleware stack.
 */
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  const { method, path, ip } = req;

  // Capture the original res.end() to log response status
  const originalEnd = res.end;
  res.end = function (...args) {
    const duration = Date.now() - startTime;
    const { statusCode } = res;

    // Format: [HH:MM:SS] METHOD PATH → STATUS (duration ms)
    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const statusColor =
      statusCode >= 500
        ? '❌'
        : statusCode >= 400
          ? '⚠️'
          : statusCode >= 300
            ? '→'
            : '✅';

    console.log(
      `[${timestamp}] ${statusColor} ${method.padEnd(6)} ${path} → ${statusCode} (${duration}ms)`
    );

    originalEnd.apply(res, args);
  };

  next();
};

export default requestLogger;
