# Tests

```bash
npm run typecheck     # tsc --noEmit (covers src/, scratch/*.ts and tests/)
npm test              # Vitest: configuration checks + every legacy script (about 10 s)
npm run test:smoke    # HTTP smoke tests; needs SMOKE_BASE_URL (see below)
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint (a gate: no errors, warnings capped), `npm test`, `npm run build`,
then starts the production build and runs the smoke tests. It needs no secrets.

## How `npm test` works

The project's tests live as standalone scripts in `scratch/test_*.{ts,mjs}`. Each one prints its
checks and exits non-zero on failure. `tests/legacy-scripts.test.ts` runs every script listed in
`tests/suite.config.ts` as its own Vitest test, in a child process, with real keys
(`NVIDIA_API_KEY`, `SUPABASE_*`, ...) removed from the environment. A failure shows the script's last
40 lines of output.

### Adding a test

1. Write `scratch/test_<name>.ts`. It must be self-contained: no network, no real secrets, no
   running server, no browser. Use dummy values such as `process.env.NEXT_PUBLIC_SUPABASE_URL =
   "https://dummy.supabase.co"` and fakes for I/O. Exit non-zero on failure.
2. Add its filename to `RUN` in `tests/suite.config.ts`.

The suite **fails** if a `scratch/test*` file is in neither `RUN` nor `EXCLUDED`, so a new script can
never be silently skipped, and a script that touches live services can never be silently run.

### Excluded scripts

`EXCLUDED` lists scripts that are not run automatically, each with a reason: those that write to the
live Supabase project (`*_live_db.ts`), call the paid NVIDIA API (`test94.mjs`), or drive real
browsers against a running server (Phase 12 WebRTC/meeting scripts). Run those by hand when you
need them, for example `npx tsx scratch/test_phase13_7_live_db.ts` against a safe project.

### Gotcha: `.mjs` scripts importing TypeScript barrels

`tsx` can fail to resolve `export *` re-exports when an `.mjs` file imports a `.ts` index
(`does not provide an export named ...`). If you hit it, name the script `.ts`. Because `tsconfig`
includes `**/*.ts`, a `.ts` script is type-checked by `npm run typecheck` and `next build`; add
`// @ts-nocheck` if it uses deliberately partial mocks.

## Smoke tests

`tests/smoke.test.ts` is skipped unless `SMOKE_BASE_URL` is set. To run it locally without touching a
running `next dev`, build into a separate folder:

```bash
NEXT_DIST_DIR=.next-smoke ECHO_DEMO_MODE=false \
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder SUPABASE_SERVICE_ROLE_KEY=placeholder \
  npx next build
# (Next rewrites tsconfig.json when distDir changes; `git checkout tsconfig.json` afterwards.)
NEXT_DIST_DIR=.next-smoke ECHO_DEMO_MODE=false \
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder SUPABASE_SERVICE_ROLE_KEY=placeholder \
  npx next start -p 3100
SMOKE_BASE_URL=http://localhost:3100 npm run test:smoke
```

Set `ECHO_DEMO_MODE=false` explicitly: Next also reads `.env.local`, which may enable demo mode.
