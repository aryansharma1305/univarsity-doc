import { config } from 'zod';

// Runs in the browser before the app. Zod's JIT probes `new Function` once; the strict CSP
// (src/lib/csp.ts, no 'unsafe-eval') reports that probe as a violation even though Zod catches it.
config({ jitless: true });
