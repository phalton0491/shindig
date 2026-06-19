import { Session } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  SafeAreaView,
  StyleSheet,
  View,
} from 'react-native';

import { supabase } from './src/lib/supabase';
import { listFriendsForUser } from './src/lib/friends';
import { createShindig, listFeedShindigs, listShindigsForUser } from './src/lib/shindigs';
import { ensureProfileForUser, updateProfile } from './src/lib/profiles';
import { BottomNav, AppTab } from './src/components/BottomNav';
import { AuthScreen } from './src/screens/AuthScreen';
import { BackendSetupScreen } from './src/screens/BackendSetupScreen';
import { FriendsScreen } from './src/screens/FriendsScreen';
import { HomeFeedScreen } from './src/screens/HomeFeedScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { theme } from './src/theme';
import { FeedShindig, FriendProfile, SavedShindig, UserProfile } from './src/types/models';

type AuthMode = 'login' | 'signup';
const BOOTSTRAP_TIMEOUT_MS = 8000;

function authModeFromUrl(url: string | null): AuthMode {
  if (!url) {
    return 'login';
  }

  return url.toLowerCase().includes('signup') ? 'signup' : 'login';
}

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
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [feedShindigs, setFeedShindigs] = useState<FeedShindig[]>([]);
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [feedShindig, setFeedShindig] = useState<SavedShindig | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [bootError, setBootError] = useState('');

  async function loadAuthedData(nextSession: Session) {
    const [nextFriends, nextProfile, nextShindigs] = await Promise.all([
      withTimeout(
        listFriendsForUser(nextSession.user.id),
        BOOTSTRAP_TIMEOUT_MS,
        'Friends load'
      ),
      withTimeout(
        ensureProfileForUser(nextSession.user),
        BOOTSTRAP_TIMEOUT_MS,
        'Profile load'
      ),
      withTimeout(
        listShindigsForUser(nextSession.user.id),
        BOOTSTRAP_TIMEOUT_MS,
        'ShinDig load'
      ),
    ]);

    const nextFeed = await withTimeout(
      listFeedShindigs({
        friendIds: nextFriends.map((friend) => friend.id),
        userId: nextSession.user.id,
      }),
      BOOTSTRAP_TIMEOUT_MS,
      'Feed load'
    );

    return {
      feed: nextFeed,
      friends: nextFriends,
      profile: {
        ...nextProfile,
        stats: {
          ...nextProfile.stats,
          friends: nextFriends.length,
          outings: nextShindigs.length,
        },
      },
      shindigs: nextShindigs,
    };
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialAuthMode() {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (isMounted) {
          setAuthMode(authModeFromUrl(initialUrl));
        }
      } catch {
        if (isMounted) {
          setAuthMode('login');
        }
      }
    }

    loadInitialAuthMode();

    const linkSubscription = Linking.addEventListener('url', ({ url }) => {
      if (isMounted) {
        setAuthMode(authModeFromUrl(url));
      }
    });

    return () => {
      isMounted = false;
      linkSubscription.remove();
    };
  }, []);

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
          const loaded = await loadAuthedData(currentSession);

          if (isMounted) {
            setFriends(loaded.friends);
            setFeedShindigs(loaded.feed);
            setShindigs(loaded.shindigs);
            setProfile(loaded.profile);
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
          setFriends([]);
          setFeedShindigs([]);
          setActiveTab('home');
          setFeedShindig(null);
          setAuthMode('login');
          return;
        }

        try {
          const loaded = await loadAuthedData(nextSession);
          if (isMounted) {
            setFriends(loaded.friends);
            setFeedShindigs(loaded.feed);
            setShindigs(loaded.shindigs);
            setProfile(loaded.profile);
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
    const nextWithStats = {
      ...savedProfile,
      stats: {
        ...savedProfile.stats,
        friends: friends.length,
        outings: shindigs.length,
      },
    };
    setProfile(nextWithStats);
    return nextWithStats;
  }

  async function handleShindigSaved(args: Parameters<typeof createShindig>[0]) {
    const savedShindig = await createShindig(args);
    const nextShindigs = [savedShindig, ...shindigs];
    setShindigs(nextShindigs);
    if (profile) {
      setProfile({
        ...profile,
        stats: {
          ...profile.stats,
          friends: friends.length,
          outings: nextShindigs.length,
        },
      });
    }
    const owner = friends.find((friend) => friend.id === args.userId) || {
      avatar: profile?.avatar || '',
      city: profile?.city || '',
      handle: profile?.handle || '@you',
      id: args.userId,
      name: profile?.name || 'You',
    };
    setFeedShindigs((current) => [{ ...savedShindig, owner }, ...current]);
    return savedShindig;
  }

  async function refreshFriends() {
    if (!session?.user) {
      return;
    }

    const nextFriends = await listFriendsForUser(session.user.id);
    setFriends(nextFriends);
    if (profile) {
      setProfile({
        ...profile,
        stats: {
          ...profile.stats,
          friends: nextFriends.length,
        },
      });
    }
    const nextFeed = await listFeedShindigs({
      friendIds: nextFriends.map((friend) => friend.id),
      userId: session.user.id,
    });
    setFeedShindigs(nextFeed);
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
        <AuthScreen bootError={bootError} initialMode={authMode} />
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <View style={styles.appShell}>
        <View style={styles.screenShell}>
          {activeTab === 'home' ? (
            <HomeFeedScreen
              feedShindigs={feedShindigs}
              onOpenProfile={() => setActiveTab('profile')}
              profile={profile}
            />
          ) : null}
          {activeTab === 'friends' ? (
            <FriendsScreen
              friends={friends}
              onFriendsChanged={refreshFriends}
              onOpenProfile={() => setActiveTab('profile')}
              profile={profile}
              userId={session.user.id}
            />
          ) : null}
          {activeTab === 'shindigs' ? (
            <HomeScreen
              initialFeedShindig={feedShindig}
              onConsumeInitialFeedShindig={() => setFeedShindig(null)}
              onShindigSaved={handleShindigSaved}
              onOpenProfile={() => setActiveTab('profile')}
              profile={profile}
              shindigs={shindigs}
              userId={session.user.id}
            />
          ) : null}
          {activeTab === 'profile' ? (
            <ProfileScreen
              onBackHome={() => setActiveTab('home')}
              onOpenShindig={(shindig) => {
                setFeedShindig(shindig);
                setActiveTab('shindigs');
              }}
              onProfileSaved={handleProfileSaved}
              profile={profile}
              shindigs={shindigs}
              userId={session.user.id}
            />
          ) : null}
        </View>
        <BottomNav activeTab={activeTab} onSelectTab={setActiveTab} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  appShell: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
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
  screenShell: {
    flex: 1,
  },
});
