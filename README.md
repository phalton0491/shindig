# ShinDig

Mobile application boilerplate for a social-style day/night outing tracker, built with Expo and React Native.

## What is included

- Supabase-backed auth and persisted sessions
- Username/password sign up and log in
- Profile-first mobile UI with a feed landing page
- Database-backed editable profile details
- Profile photo upload with Expo Image Picker and Supabase Storage
- Album-style archive grid for "days" and "nights"

## Backend setup

1. Create a Supabase project.
2. Copy `.env.example` to `.env`.
3. Fill in:

```bash
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

4. Run the SQL in [supabase/schema.sql](/C:/Users/phalton/Documents/ShinDig/supabase/schema.sql).

## Run locally

```bash
yarn start:clear
```

## Notes

- The app now expects Supabase to be configured. Without it, the app shows a setup screen instead of silently falling back to local-only accounts.
- Supabase Auth now uses a real user email for sign-up and login, while `username` is stored separately as the public handle in the profile record.
- Profile editing currently supports image upload for avatars plus full name, city, and bio.

## Project structure

```text
App.tsx
src/
  components/
  data/
  lib/
  screens/
  theme.ts
supabase/
  schema.sql
```
