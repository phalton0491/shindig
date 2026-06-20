import { Session } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  Image,
  Linking,
  SafeAreaView,
  StyleSheet,
  View,
} from 'react-native';

import { signOut } from './src/lib/auth';
import { AuthMenu } from './src/components/AuthMenu';
import {
  createNotification,
  dismissFriendRequestNotification,
  listNotificationsForUser,
  markNotificationsRead,
} from './src/lib/notifications';
import { supabase } from './src/lib/supabase';
import { acceptFriendRequest, listFriendsForUser, rejectFriendRequest } from './src/lib/friends';
import {
  approvePhotoAddRequest,
  createShindig,
  listFeedShindigs,
  listShindigsForUser,
  rejectPhotoAddRequest,
} from './src/lib/shindigs';
import { ensureProfileForUser, getProfileForUser, updateProfile } from './src/lib/profiles';
import { BottomNav, AppTab } from './src/components/BottomNav';
import { AuthScreen } from './src/screens/AuthScreen';
import { BackendSetupScreen } from './src/screens/BackendSetupScreen';
import { FriendProfileScreen } from './src/screens/FriendProfileScreen';
import { FriendsScreen } from './src/screens/FriendsScreen';
import { HomeFeedScreen } from './src/screens/HomeFeedScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { theme } from './src/theme';
import {
  AppNotification,
  FeedShindig,
  FriendProfile,
  SavedShindig,
  UserProfile,
} from './src/types/models';

type AuthMode = 'login' | 'signup';
const BOOTSTRAP_TIMEOUT_MS = 8000;
const BOOT_LOGO = require('./assets/auth-logo.png');

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
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [feedShindig, setFeedShindig] = useState<SavedShindig | null>(null);
  const [highlightedPhotoId, setHighlightedPhotoId] = useState<string | null>(null);
  const [friendProfileDetail, setFriendProfileDetail] = useState<{
    profile: UserProfile;
    shindigs: SavedShindig[];
  } | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [bootError, setBootError] = useState('');

  async function loadAuthedData(nextSession: Session) {
    const [nextFriends, nextNotifications, nextProfile, nextShindigs] = await Promise.all([
      withTimeout(
        listFriendsForUser(nextSession.user.id),
        BOOTSTRAP_TIMEOUT_MS,
        'Friends load'
      ),
      withTimeout(
        listNotificationsForUser(nextSession.user.id),
        BOOTSTRAP_TIMEOUT_MS,
        'Notifications load'
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
      notifications: nextNotifications,
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
            setNotifications(loaded.notifications);
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
          setNotifications([]);
          setActiveTab('home');
          setFeedShindig(null);
          setHighlightedPhotoId(null);
          setFriendProfileDetail(null);
          setShowNotifications(false);
          setShowSettings(false);
          setAuthMode('login');
          return;
        }

        try {
          const loaded = await loadAuthedData(nextSession);
          if (isMounted) {
            setFriends(loaded.friends);
            setFeedShindigs(loaded.feed);
            setNotifications(loaded.notifications);
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

  async function refreshNotifications() {
    if (!session?.user) {
      return;
    }

    const nextNotifications = await listNotificationsForUser(session.user.id);
    setNotifications(nextNotifications);
  }

  async function handleOpenNotifications() {
    if (!session?.user) {
      return;
    }

    setFriendProfileDetail(null);
    setShowSettings(false);
    setShowNotifications(true);
    await markNotificationsRead(session.user.id);
    await refreshNotifications();
  }

  async function handleOpenFriendProfile(friendId: string) {
    const [nextProfile, nextShindigs] = await Promise.all([
      getProfileForUser(friendId),
      listShindigsForUser(friendId),
    ]);

    if (!nextProfile) {
      throw new Error('That friend profile could not be loaded.');
    }

    setShowSettings(false);
    setFriendProfileDetail({
      profile: nextProfile,
      shindigs: nextShindigs,
    });
  }

  function handleOpenNotification(notification: AppNotification) {
    if (!notification.shindigId) {
      handleOpenFriendProfile(notification.actor.id);
      return;
    }

    const targetShindig =
      shindigs.find((item) => item.id === notification.shindigId) ||
      feedShindigs.find((item) => item.id === notification.shindigId) ||
      null;

    if (!targetShindig) {
      return;
    }

    setShowNotifications(false);
    setShowSettings(false);
    setFriendProfileDetail(null);
    setFeedShindig(targetShindig);
    setHighlightedPhotoId(notification.photoId || null);
    setActiveTab('shindigs');
  }

  async function handleAcceptFriendRequest(friendId: string) {
    if (!session?.user || !profile) {
      return;
    }

    await acceptFriendRequest({ friendId, userId: session.user.id });
    await createNotification({
      actorUserId: session.user.id,
      message: `${profile.name} accepted your friend request.`,
      recipientUserId: friendId,
      type: 'friend_accept',
    });
    await dismissFriendRequestNotification({
      actorUserId: friendId,
      recipientUserId: session.user.id,
    });
    await Promise.all([refreshFriends(), refreshNotifications()]);
  }

  async function handleRejectFriendRequest(friendId: string) {
    if (!session?.user) {
      return;
    }

    await rejectFriendRequest({ friendId, userId: session.user.id });
    await dismissFriendRequestNotification({
      actorUserId: friendId,
      recipientUserId: session.user.id,
    });
    await Promise.all([refreshFriends(), refreshNotifications()]);
  }

  async function handleApprovePhotoRequest(requestId: string) {
    if (!session?.user) {
      return;
    }

    await approvePhotoAddRequest({
      requestId,
      userId: session.user.id,
    });
    const [nextShindigs, nextFeed, nextNotifications] = await Promise.all([
      listShindigsForUser(session.user.id),
      listFeedShindigs({
        friendIds: friends.map((friend) => friend.id),
        userId: session.user.id,
      }),
      listNotificationsForUser(session.user.id),
    ]);
    setShindigs(nextShindigs);
    setFeedShindigs(nextFeed);
    setNotifications(nextNotifications);
  }

  async function handleRejectPhotoRequest(requestId: string) {
    if (!session?.user) {
      return;
    }

    await rejectPhotoAddRequest({
      requestId,
      userId: session.user.id,
    });
    await refreshNotifications();
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
        <Image source={BOOT_LOGO} style={styles.loadingLogo} />
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
          {showNotifications ? (
            <NotificationsScreen
              notifications={notifications}
              onAcceptFriendRequest={handleAcceptFriendRequest}
              onOpenNotification={handleOpenNotification}
              onApprovePhotoRequest={handleApprovePhotoRequest}
              onBack={() => setShowNotifications(false)}
              onOpenFriend={handleOpenFriendProfile}
              onRejectPhotoRequest={handleRejectPhotoRequest}
              onRejectFriendRequest={handleRejectFriendRequest}
            />
          ) : showSettings ? (
            <SettingsScreen
              onProfileSaved={handleProfileSaved}
              profile={profile}
              userId={session.user.id}
            />
          ) : friendProfileDetail ? (
            <FriendProfileScreen
              onBack={() => setFriendProfileDetail(null)}
              onOpenShindig={(shindig) => {
                setFeedShindig(shindig);
                setFriendProfileDetail(null);
                setActiveTab('shindigs');
              }}
              profile={friendProfileDetail.profile}
              shindigs={friendProfileDetail.shindigs}
            />
          ) : activeTab === 'home' ? (
            <HomeFeedScreen
              feedShindigs={feedShindigs}
              onOpenFriend={handleOpenFriendProfile}
              onOpenShindig={(shindig) => {
                setFeedShindig(shindig);
                setActiveTab('shindigs');
              }}
            />
          ) : null}
          {!showNotifications && !showSettings && !friendProfileDetail && activeTab === 'friends' ? (
            <FriendsScreen
              friends={friends}
              onFriendsChanged={refreshFriends}
              onOpenFriend={handleOpenFriendProfile}
              onOpenProfile={() => setActiveTab('profile')}
              profile={profile}
              userId={session.user.id}
            />
          ) : null}
          {!showNotifications && !showSettings && !friendProfileDetail && activeTab === 'shindigs' ? (
            <HomeScreen
              initialFeedShindig={feedShindig}
              initialHighlightedPhotoId={highlightedPhotoId}
              onConsumeInitialFeedShindig={() => setFeedShindig(null)}
              onConsumeInitialHighlightedPhotoId={() => setHighlightedPhotoId(null)}
              onShindigSaved={handleShindigSaved}
              profile={profile}
              shindigs={shindigs}
              userId={session.user.id}
            />
          ) : null}
          {!showNotifications && !showSettings && !friendProfileDetail && activeTab === 'profile' ? (
            <ProfileScreen
              onBackHome={() => setActiveTab('home')}
              onOpenShindig={(shindig) => {
                setFeedShindig(shindig);
                setActiveTab('shindigs');
              }}
              profile={profile}
              shindigs={shindigs}
            />
          ) : null}
        </View>
        <AuthMenu
          notificationCount={notifications.filter((item) => !item.readAt).length}
          onOpenNotifications={handleOpenNotifications}
          onOpenSettings={() => {
            setFriendProfileDetail(null);
            setShowNotifications(false);
            setShowSettings(true);
          }}
          onSignOut={signOut}
        />
        <BottomNav
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setShowNotifications(false);
            setShowSettings(false);
            setFriendProfileDetail(null);
            setActiveTab(tab);
          }}
        />
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
  loadingLogo: {
    height: 220,
    resizeMode: 'contain',
    width: 300,
  },
  screenShell: {
    flex: 1,
  },
});
