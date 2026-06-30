# Sentry Error Logging

This repository is mapped to the Sentry project `edupine-automation` in organization `park-company-dy`.

Runtime errors are sent to Sentry when `SENTRY_DSN` is set in the local or deployment environment. The real DSN should stay out of GitHub commits.

Required local values:

```env
SENTRY_DSN=your-project-dsn
SENTRY_PROJECT=edupine-automation
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0
```

Run `npm install` after pulling this change so `@sentry/node` is installed.
