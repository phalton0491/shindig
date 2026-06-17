import { supabase } from './supabase';

export type FormAuthPayload = {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  username: string;
};

const USERNAME_PATTERN = /^[a-z0-9._]{3,24}$/;

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function validateUsername(username: string) {
  const normalizedUsername = normalizeUsername(username);

  if (!USERNAME_PATTERN.test(normalizedUsername)) {
    throw new Error(
      'Username must be 3-24 characters and use only letters, numbers, periods, or underscores.'
    );
  }

  return normalizedUsername;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail.includes('@')) {
    throw new Error('Enter a valid email address.');
  }

  return normalizedEmail;
}

function client() {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  return supabase;
}

export async function signUpWithUsername(payload: FormAuthPayload) {
  const username = validateUsername(payload.username);
  const email = validateEmail(payload.email);

  const { data, error } = await client().auth.signUp({
    email,
    password: payload.password,
    options: {
      data: {
        first_name: payload.firstName.trim(),
        last_name: payload.lastName.trim(),
        username,
      },
    },
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await client().auth.signInWithPassword({
    email: validateEmail(email),
    password,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function signOut() {
  const { error } = await client().auth.signOut();

  if (error) {
    throw error;
  }
}
