import { Session } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from 'react-native';

import { UserProfile } from './src/data/mockProfile';
import { supabase } from './src/lib/supabase';
import { ensureProfileForUser, getProfileForUser, updateProfile } from './src/lib/profiles';
import { AuthScreen } from './src/screens/AuthScreen';
import { BackendSetupScreen } from './src/screens/BackendSetupScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { theme } from './src/theme';

type ActiveRoute = 'home' | 'profile';

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [route, setRoute] = useState<ActiveRoute>('home');
  const [bootError, setBootError] = useState('');

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    const client = supabase;

    let isMounted = true;

    async function bootstrap() {
      const {
        data: { session: currentSession },
      } = await client.auth.getSession();

      if (!isMounted) {
        return;
      }

      setSession(currentSession);

      if (currentSession?.user) {
        try {
          const nextProfile = await ensureProfileForUser(currentSession.user);
          if (isMounted) {
            setProfile(nextProfile);
          }
        } catch (error) {
          if (isMounted) {
            setBootError(error instanceof Error ? error.message : 'Failed to load profile.');
          }
        }
      }

      setIsLoading(false);
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
          setRoute('home');
          return;
        }

        try {
          const nextProfile = await ensureProfileForUser(nextSession.user);
          if (isMounted) {
            setProfile(nextProfile);
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
    setProfile(savedProfile);
    return savedProfile;
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
          onOpenProfile={() => setRoute('profile')}
          profile={profile}
        />
      ) : (
        <ProfileScreen
          onBackHome={() => setRoute('home')}
          onProfileSaved={handleProfileSaved}
          profile={profile}
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
