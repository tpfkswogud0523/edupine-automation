'use strict';

let Sentry = null;

if (process.env.SENTRY_DSN) {
  try {
    Sentry = require('@sentry/node');

    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT || 'production',
      release: process.env.SENTRY_RELEASE,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
    });

    process.on('unhandledRejection', (reason) => {
      Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)));
    });

    process.on('uncaughtException', (error) => {
      Sentry.captureException(error);
      Sentry.flush(2000).finally(() => process.exit(1));
    });
  } catch (error) {
    console.warn('[sentry] disabled:', error.message);
  }
}

module.exports = Sentry;
