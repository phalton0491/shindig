import { Session } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from 'react-native';

import { supabase } from './src/lib/supabase';
import { createShindig, listShindigsForUser } from './src/lib/shindigs';
import { ensureProfileForUser, getProfileForUser, updateProfile } from './src/lib/profiles';
import { AuthScreen } from './src/screens/AuthScreen';
import { BackendSetupScreen } from './src/screens/BackendSetupScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { theme } from './src/theme';
import { SavedShindig, UserProfile } from './src/types/models';

type ActiveRoute = 'home' | 'profile';
const BOOTSTRAP_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out. Check your network and Supabase settings.`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [shindigs, setShindigs] = useState<SavedShindig[]>([]);
  const [route, setRoute] = useState<ActiveRoute>('home');
  const [bootError, setBootError] = useState('');

  function withLiveStats(nextProfile: UserProfile, nextShindigs: SavedShindig[]) {
    return {
      ...nextProfile,
      stats: {
        ...nextProfile.stats,
        outings: nextShindigs.length,
      },
    };
  }

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    const client = supabase;

    let isMounted = true;

    async function bootstrap() {
      try {
        const {
          data: { session: currentSession },
        } = await withTimeout(
          client.auth.getSession(),
          BOOTSTRAP_TIMEOUT_MS,
          'Session restore'
        );

        if (!isMounted) {
          return;
        }

        setSession(currentSession);

        if (currentSession?.user) {
          const [nextProfile, nextShindigs] = await Promise.all([
            withTimeout(
              ensureProfileForUser(currentSession.user),
              BOOTSTRAP_TIMEOUT_MS,
              'Profile load'
            ),
            withTimeout(
              listShindigsForUser(currentSession.user.id),
              BOOTSTRAP_TIMEOUT_MS,
              'ShinDig load'
            ),
          ]);

          if (isMounted) {
            setShindigs(nextShindigs);
            setProfile(withLiveStats(nextProfile, nextShindigs));
          }
        }
      } catch (error) {
        if (isMounted) {
          setBootError(
            error instanceof Error ? error.message : 'Failed to finish app startup.'
          );
          setSession(null);
          setProfile(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    bootstrap();

    const { data: authListener } = client.auth.onAuthStateChange(
      async (_event, nextSession) => {
        if (!isMounted) {
          return;
        }

        setSession(nextSession);
        setBootError('');

        if (!nextSession?.user) {
          setProfile(null);
          setShindigs([]);
          setRoute('home');
          return;
        }

        try {
          const [nextProfile, nextShindigs] = await Promise.all([
            ensureProfileForUser(nextSession.user),
            listShindigsForUser(nextSession.user.id),
          ]);
          if (isMounted) {
            setShindigs(nextShindigs);
            setProfile(withLiveStats(nextProfile, nextShindigs));
          }
        } catch (error) {
          if (isMounted) {
            setBootError(
              error instanceof Error ? error.message : 'Failed to load profile.'
            );
          }
        }
      }
    );

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function handleProfileSaved(nextProfile: UserProfile) {
    if (!session?.user) {
      throw new Error('No active session.');
    }

    const savedProfile = await updateProfile(session.user.id, nextProfile);
    const nextWithStats = withLiveStats(savedProfile, shindigs);
    setProfile(nextWithStats);
    return nextWithStats;
  }

  async function handleShindigSaved(args: Parameters<typeof createShindig>[0]) {
    const savedShindig = await createShindig(args);
    const nextShindigs = [savedShindig, ...shindigs];
    setShindigs(nextShindigs);
    if (profile) {
      setProfile(withLiveStats(profile, nextShindigs));
    }
    setRoute('profile');
    return savedShindig;
  }

  if (!supabase) {
    return (
      <>
        <StatusBar style="light" />
        <BackendSetupScreen />
      </>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <StatusBar style="light" />
        <View style={styles.loadingCard}>
          <ActivityIndicator color={theme.colors.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!session || !profile) {
    return (
      <>
        <StatusBar style="light" />
        <AuthScreen bootError={bootError} />
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      {route === 'home' ? (
        <HomeScreen
          onShindigSaved={handleShindigSaved}
          onOpenProfile={() => setRoute('profile')}
          profile={profile}
          userId={session.user.id}
        />
      ) : (
        <ProfileScreen
          onBackHome={() => setRoute('home')}
          onProfileSaved={handleProfileSaved}
          profile={profile}
          shindigs={shindigs}
          userId={session.user.id}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    flex: 1,
    justifyContent: 'center',
  },
  loadingCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    height: 120,
    justifyContent: 'center',
    width: 120,
  },
});
