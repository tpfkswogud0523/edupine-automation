'use strict';

const defaultDsn = 'https://869a6f6088eb0f6ab240c18b3c6abcd8@o4511540280360960.ingest.us.sentry.io/4511654049939457';
const dsn = process.env.SENTRY_DSN || defaultDsn;
let Sentry = null;

if (dsn) {
  try {
    Sentry = require('@sentry/node');

    Sentry.init({
      dsn,
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
