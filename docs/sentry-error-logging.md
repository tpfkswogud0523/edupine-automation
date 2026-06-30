# Sentry Error Logging

This repository is mapped to the Sentry project `edupine-automation` in organization `park-company-dy`.

The project now includes a default public Sentry DSN so unhandled runtime errors can be sent to Sentry without manually looking up the DSN on each PC. You can override it with `SENTRY_DSN` in local or deployment environment variables.

Local values you may set:

```env
SENTRY_DSN=https://869a6f6088eb0f6ab240c18b3c6abcd8@o4511540280360960.ingest.us.sentry.io/4511654049939457
SENTRY_PROJECT=edupine-automation
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0
```

Run `npm install` after pulling this change so `@sentry/node` is installed.
