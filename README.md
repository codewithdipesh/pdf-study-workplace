# Study Workspace

Study-focused PDF workspace built with Next.js 15, Supabase, TailwindCSS, Zustand, React Query, react-pdf-viewer, and react-konva.

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

## Installation

1. Run `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Fill in the Supabase values.
4. Run `npm run dev`.

## Supabase setup

1. Create a new Supabase project.
2. Run the migration in `supabase/migrations/0001_initial.sql`.
3. Create the private storage bucket `pdf-files` if it does not already exist.
4. Confirm Auth providers for email/password are enabled.
5. Keep row-level security enabled on all tables.

## Vercel deployment

1. Push the repo to GitHub.
2. Import the repo into Vercel.
3. Add the environment variables above in Vercel.
4. Set the build command to `npm run build`.
5. Deploy and verify redirects, auth, and PDF uploads against Supabase.

## Local project tree

- `src/app`
- `src/components`
- `src/hooks`
- `src/lib`
- `src/store`
- `src/types`
- `supabase/migrations`
