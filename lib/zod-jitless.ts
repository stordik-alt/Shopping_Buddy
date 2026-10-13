import { config } from 'zod'

// Zod speeds up object validation by compiling it with `new Function`. Zod first probes whether that is
// allowed, and under a strict Content-Security-Policy (lib/csp.ts, no 'unsafe-eval') the browser reports
// the caught probe as a violation even though nothing breaks. Turning the compiled path off removes the
// probe and the console noise; validation here is on small forms, so the speed-up is not needed.
// Must run before any schema is created, so it is imported first by everything that loads the auth client.
config({ jitless: true })
