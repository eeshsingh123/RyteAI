---
name: Supabase auth + credits
overview: Add Supabase email+password auth in the Next.js frontend, require Supabase JWT auth for all backend routes, and implement a simple 10-credit system stored in Supabase Postgres with atomic decrement/refund for AI calls.
todos:
  - id: supabase-sql
    content: Add Supabase SQL for `profiles` table, trigger (10 credits on signup), RLS policies, and `consume_credit`/`refund_credit` RPCs.
    status: completed
  - id: backend-authz
    content: Implement Supabase JWT verification dependency in FastAPI and refactor all canvas + AI routes to use `current_user.user_id` (remove request `user_id`).
    status: completed
    dependencies:
      - supabase-sql
  - id: backend-credits
    content: Integrate credit consume/refund around LLM calls with service-role Supabase client; return 402 when out of credits.
    status: completed
    dependencies:
      - backend-authz
  - id: frontend-auth
    content: "Add Supabase JS auth (signup/login), store session, and attach `Authorization: Bearer <token>` to backend requests; remove `USER_ID` constant flow."
    status: completed
    dependencies:
      - backend-authz
---

# Supabase Auth + Credits (Minimal)

## Architecture decisions (why)

- **Auth happens in the frontend (Supabase JS)**: the browser signs up/signs in with email+password and gets a session token. This is the simplest flow with Supabase Auth ([Supabase password auth docs](https://supabase.com/docs/guides/auth/passwords)).
- **Authorization happens in the backend (FastAPI)**: every API request includes `Authorization: Bearer <access_token>`, and the backend **verifies the JWT** and uses the JWT’s `sub` as the only source of truth for `user_id`. This avoids trusting `user_id` passed from the client (which is currently insecure).
- **Credits live in Supabase Postgres (not MongoDB)**: Mongo remains for canvas docs; user profile/credits are stored once in Supabase, avoiding redundant “user tables” in Mongo.

## Data model (Supabase Postgres)

- Create `public.profiles`:
- `user_id uuid primary key references auth.users(id) on delete cascade`
- `credits int not null default 10`
- optional: `created_at timestamptz not null default now()`
- Add a trigger on `auth.users` insert to create a `profiles` row with **10 credits**.
- Add **RPC functions** (atomic + concurrency-safe):
- `consume_credit(p_user_id uuid, p_amount int default 1)` → checks balance and decrements in a single transaction.
- `refund_credit(p_user_id uuid, p_amount int default 1)` → increments.
- Enable **RLS** on `profiles`:
- allow `select` where `auth.uid() = user_id`
- disallow client updates to `credits` (only backend uses service role key)

## Backend changes (FastAPI)

- Add JWT auth dependency:
- New module like `backend/auth/supabase_auth.py` to:
- read `Authorization` header
- verify the JWT (using `SUPABASE_JWT_SECRET` or JWKS)
- return `current_user` with `user_id=sub`
- Update routers to use `current_user.user_id` (never from request body/query):
- `backend/routers/canvas_router.py`: all CRUD must filter by `user_id`.
- `GET /canvas` uses `current_user.user_id`
- `GET/PUT/PATCH/DELETE` must verify the canvas belongs to the current user
- `backend/routers/ai_router.py`: remove `user_id` from requests; use `current_user.user_id` to validate canvas ownership.
- Add credits enforcement in AI routes:
- Before calling the LLM, call Supabase RPC `consume_credit(user_id, 1)` using **service role key** (server-only).
- If the LLM call fails, call `refund_credit(user_id, 1)`.
- Return a clear error (e.g. `402 Payment Required`) when credits are 0.

## Frontend changes (Next.js)

- Add Supabase client and auth UI:
- Add `@supabase/supabase-js`.
- Create `frontend/lib/supabaseClient.ts` using `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Add pages:
- `frontend/app/login/page.tsx` (email+password)
- `frontend/app/signup/page.tsx` (email+password)
- Add a minimal auth guard for canvas routes (redirect to login when signed out).
- Send tokens to backend:
- Update `frontend/hooks/useCanvasApi.ts` to:
- remove `USER_ID` usage
- attach `Authorization: Bearer <access_token>` to every backend request
- (Optional, minimal) show credits in UI:
- fetch `profiles.credits` from Supabase (client-side `select`) and display in sidebar/header.

## Config / env

- Frontend `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Backend `.env`:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `SUPABASE_JWT_SECRET` (server-only, for JWT verification)

## Security posture (meets your “minimal but efficient” requirement)

- **Passwords are never stored by us**; Supabase Auth handles password storage/verification ([docs](https://supabase.com/docs/guides/auth/passwords)).
- Backend never trusts client-provided `user_id`.
- Credits cannot be forged by the client because mutation happens only via backend using the service role key.

## Notes about MongoDB

- We will **not** store user credentials or credit balances in MongoDB.
- We’ll keep `canvas.user_id` in Mongo as a **Supabase user UUID string** and always query/filter by it.