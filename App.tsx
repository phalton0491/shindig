import { Session } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  Image,
  Linking,
  Platform,
  SafeAreaView,
  StyleSheet,
  View,
} from 'react-native';

import { signOut } from './src/lib/auth';
import { AuthMenu } from './src/components/AuthMenu';
import {
  createNotification,
  listNotificationsForUser,
  markNotificationsRead,
  resolveFriendRequestNotification,
} from './src/lib/notifications';
import { supabase } from './src/lib/supabase';
import { acceptFriendRequest, listFriendsForUser, rejectFriendRequest } from './src/lib/friends';
import {
  acceptShindigInvite,
  approvePhotoAddRequest,
  claimShindigInvite,
  createShindig,
  deletePhotoFromShindig,
  deleteShindig,
  getShindigById,
  listFeedShindigs,
  listShindigsForUser,
  maybeShindigInvite,
  rejectShindigInvite,
  rejectPhotoAddRequest,
  updateShindigCoverPhoto,
  updateShindigState,
} from './src/lib/shindigs';
import { registerForPushNotifications } from './src/lib/push';
import { ensureProfileForUser, getProfileForUser, updateProfile } from './src/lib/profiles';
import { BottomNav, AppTab } from './src/components/BottomNav';
import { AuthScreen } from './src/screens/AuthScreen';
import { BackendSetupScreen } from './src/screens/BackendSetupScreen';
import { FriendProfileScreen } from './src/screens/FriendProfileScreen';
import { FriendsScreen } from './src/screens/FriendsScreen';
import { HomeFeedScreen } from './src/screens/HomeFeedScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { MoreScreen } from './src/screens/MoreScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ProfileFriendsScreen } from './src/screens/ProfileFriendsScreen';
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

  return url.toLowerCase().includes('signup') || inviteTokenFromUrl(url) ? 'signup' : 'login';
}

function inviteTokenFromUrl(url: string | null) {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.searchParams.get('invite');
  } catch {
    return null;
  }
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

function countOwnedShindigs(userId: string, shindigs: SavedShindig[]) {
  return shindigs.filter((shindig) => shindig.ownerId === userId).length;
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
  const [homeScrollToTopSignal, setHomeScrollToTopSignal] = useState(0);
  const [feedShindig, setFeedShindig] = useState<SavedShindig | null>(null);
  const [highlightedPhotoId, setHighlightedPhotoId] = useState<string | null>(null);
  const [pendingShindigStep, setPendingShindigStep] = useState<'create' | 'welcome' | null>(null);
  const [hideShindigsTabSelection, setHideShindigsTabSelection] = useState(false);
  const [friendProfileDetail, setFriendProfileDetail] = useState<{
    friends: FriendProfile[];
    profile: UserProfile;
    shindigs: SavedShindig[];
  } | null>(null);
  const [profileFriendsDetail, setProfileFriendsDetail] = useState<{
    friends: FriendProfile[];
    ownerId?: string;
    ownerName: string;
    showAddButtons: boolean;
  } | null>(null);
  const [feedReturnTarget, setFeedReturnTarget] = useState<
    | { kind: 'shindigs' }
    | { kind: 'tab'; tab: AppTab }
    | {
        detail: {
          friends: FriendProfile[];
          profile: UserProfile;
          shindigs: SavedShindig[];
        };
        kind: 'friendProfile';
        tab: AppTab;
      }
    | { kind: 'notifications'; tab: AppTab }
  >({ kind: 'shindigs' });
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [bootError, setBootError] = useState('');
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(null);
  const friendsRef = useRef<FriendProfile[]>([]);
  const profileRef = useRef<UserProfile | null>(null);
  const refreshTimeoutsRef = useRef<
    Partial<Record<'friends' | 'notifications' | 'shindigs', ReturnType<typeof setTimeout>>>
  >({});

  useEffect(() => {
    friendsRef.current = friends;
  }, [friends]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  function scheduleRefresh(
    kind: 'friends' | 'notifications' | 'shindigs',
    callback: () => Promise<void>
  ) {
    if (refreshTimeoutsRef.current[kind]) {
      return;
    }

    refreshTimeoutsRef.current[kind] = setTimeout(() => {
      delete refreshTimeoutsRef.current[kind];
      void callback();
    }, 350);
  }

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
        listShindigsForUser(nextSession.user.id, { includeAcceptedInvites: true }),
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
          shindigs: countOwnedShindigs(nextSession.user.id, nextShindigs),
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
          setPendingInviteToken(inviteTokenFromUrl(initialUrl));
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
        setPendingInviteToken(inviteTokenFromUrl(url));
      }
    });

    return () => {
      isMounted = false;
      linkSubscription.remove();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function claimPendingInvite() {
      if (!session?.user || !pendingInviteToken) {
        return;
      }

      try {
        const claimedInvite = await claimShindigInvite({
          inviteToken: pendingInviteToken,
        });

        if (!isMounted) {
          return;
        }

        const nextNotifications = await listNotificationsForUser(session.user.id);
        if (!isMounted) {
          return;
        }

        setNotifications(nextNotifications);
        setShowMore(false);
        setShowSettings(false);
        setFriendProfileDetail(null);
        setShowNotifications(true);
      } catch (error) {
        if (isMounted) {
          setBootError(
            error instanceof Error ? error.message : 'That ShinDig invite could not be opened.'
          );
        }
      } finally {
        if (isMounted) {
          setPendingInviteToken(null);
        }
      }
    }

    claimPendingInvite();

    return () => {
      isMounted = false;
    };
  }, [pendingInviteToken, session?.user?.id]);

  useEffect(() => {
    let isMounted = true;

    async function registerPush() {
      if (!session?.user) {
        return;
      }

      try {
        await registerForPushNotifications(session.user.id);
      } catch (error) {
        if (isMounted) {
          setBootError(
            error instanceof Error
              ? error.message
              : 'Push notifications could not be enabled on this device.'
          );
        }
      }
    }

    registerPush();

    return () => {
      isMounted = false;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user || Platform.OS === 'web') {
      return;
    }

    const sessionUserId = session.user.id;

    async function openPushTarget(data: Record<string, unknown> | null | undefined) {
      const shindigId =
        typeof data?.shindigId === 'string' && data.shindigId ? data.shindigId : null;
      const photoId = typeof data?.photoId === 'string' && data.photoId ? data.photoId : null;

      if (!shindigId) {
        await handleOpenNotifications();
        return;
      }

      const targetShindig =
        shindigs.find((item) => item.id === shindigId) ||
        feedShindigs.find((item) => item.id === shindigId) ||
        (await getShindigById({
          shindigId,
          userId: sessionUserId,
        }));

      if (!targetShindig) {
        await handleOpenNotifications();
        return;
      }

      setShowNotifications(false);
      setShowMore(false);
      setShowSettings(false);
      setFriendProfileDetail(null);
      setFeedShindig(targetShindig);
      setHighlightedPhotoId(photoId);
      setActiveTab('shindigs');
    }

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response?.notification.request.content.data) {
        void openPushTarget(response.notification.request.content.data as Record<string, unknown>);
      }
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void openPushTarget(response.notification.request.content.data as Record<string, unknown>);
    });

    return () => {
      subscription.remove();
    };
  }, [session?.user?.id, shindigs, feedShindigs]);

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
          setPendingShindigStep(null);
          setFriendProfileDetail(null);
          setShowNotifications(false);
          setShowMore(false);
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
        shindigs: session ? countOwnedShindigs(session.user.id, shindigs) : shindigs.length,
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
          shindigs: session ? countOwnedShindigs(session.user.id, nextShindigs) : nextShindigs.length,
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

  async function handleShindigStateChanged(args: {
    shindigId: string;
    state: 'active' | 'completed' | 'planned';
  }) {
    if (!session?.user) {
      throw new Error('No active session.');
    }

    const updatedShindig = await updateShindigState({
      shindigId: args.shindigId,
      state: args.state,
      userId: session.user.id,
    });

    setShindigs((current) =>
      current.map((shindig) => (shindig.id === updatedShindig.id ? updatedShindig : shindig))
    );
    setFeedShindigs((current) =>
      current.map((shindig) =>
        shindig.id === updatedShindig.id ? { ...shindig, ...updatedShindig } : shindig
      )
    );
    setFeedShindig((current) =>
      current?.id === updatedShindig.id ? updatedShindig : current
    );

    return updatedShindig;
  }

  async function handleShindigCoverPhotoChanged(args: {
    photoId: string;
    shindigId: string;
  }) {
    if (!session?.user) {
      throw new Error('No active session.');
    }

    const updatedShindig = await updateShindigCoverPhoto({
      photoId: args.photoId,
      shindigId: args.shindigId,
      userId: session.user.id,
    });

    setShindigs((current) =>
      current.map((shindig) => (shindig.id === updatedShindig.id ? updatedShindig : shindig))
    );
    setFeedShindigs((current) =>
      current.map((shindig) =>
        shindig.id === updatedShindig.id ? { ...shindig, ...updatedShindig } : shindig
      )
    );
    setFeedShindig((current) =>
      current?.id === updatedShindig.id ? updatedShindig : current
    );

    return updatedShindig;
  }

  async function handleShindigDeleted(shindigId: string) {
    if (!session?.user) {
      throw new Error('No active session.');
    }

    await deleteShindig({
      shindigId,
      userId: session.user.id,
    });

    let nextOwnedShindigCount = 0;
    setShindigs((current) => {
      const nextShindigs = current.filter((shindig) => shindig.id !== shindigId);
      nextOwnedShindigCount = session
        ? countOwnedShindigs(session.user.id, nextShindigs)
        : nextShindigs.length;
      return nextShindigs;
    });
    setFeedShindigs((current) => current.filter((shindig) => shindig.id !== shindigId));
    setFeedShindig((current) => (current?.id === shindigId ? null : current));

    if (profile) {
      setProfile({
        ...profile,
        stats: {
          ...profile.stats,
          shindigs: nextOwnedShindigCount,
        },
      });
    }
  }

  async function handleShindigPhotoDeleted(args: {
    photoId: string;
    shindigId: string;
  }) {
    if (!session?.user) {
      throw new Error('No active session.');
    }

    const updatedShindig = await deletePhotoFromShindig({
      photoId: args.photoId,
      shindigId: args.shindigId,
      userId: session.user.id,
    });

    if (!updatedShindig) {
      setShindigs((current) => current.filter((shindig) => shindig.id !== args.shindigId));
      setFeedShindigs((current) => current.filter((shindig) => shindig.id !== args.shindigId));
      setFeedShindig((current) => (current?.id === args.shindigId ? null : current));
      return null;
    }

    setShindigs((current) =>
      current.map((shindig) => (shindig.id === updatedShindig.id ? updatedShindig : shindig))
    );
    setFeedShindigs((current) =>
      current.map((shindig) =>
        shindig.id === updatedShindig.id ? { ...shindig, ...updatedShindig } : shindig
      )
    );
    setFeedShindig((current) =>
      current?.id === updatedShindig.id ? updatedShindig : current
    );

    return updatedShindig;
  }

  async function refreshFriends() {
    if (!session?.user) {
      return;
    }

    const nextFriends = await listFriendsForUser(session.user.id);
    setFriends(nextFriends);
    if (profileRef.current) {
      setProfile({
        ...profileRef.current,
        stats: {
          ...profileRef.current.stats,
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

  async function refreshFeed(nextFriends = friendsRef.current) {
    if (!session?.user) {
      return;
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

  async function refreshShindigsAndFeed(nextFriends = friendsRef.current) {
    if (!session?.user) {
      return;
    }

    const [nextShindigs, nextFeed] = await Promise.all([
      listShindigsForUser(session.user.id, { includeAcceptedInvites: true }),
      listFeedShindigs({
        friendIds: nextFriends.map((friend) => friend.id),
        userId: session.user.id,
      }),
    ]);

    setShindigs(nextShindigs);
    setFeedShindigs(nextFeed);
    if (profileRef.current) {
      setProfile({
        ...profileRef.current,
        stats: {
          ...profileRef.current.stats,
          friends: nextFriends.length,
          shindigs: countOwnedShindigs(session.user.id, nextShindigs),
        },
      });
    }
  }

  useEffect(() => {
    if (!supabase || !session?.user) {
      return;
    }

    const userId = session.user.id;
    const client = supabase;
    const channel = client
      .channel(`notifications-live:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friendships',
        },
        () => {
          scheduleRefresh('friends', refreshFriends);
          scheduleRefresh('notifications', refreshNotifications);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          filter: `recipient_user_id=eq.${userId}`,
          schema: 'public',
          table: 'notifications',
        },
        () => {
          scheduleRefresh('notifications', refreshNotifications);
          scheduleRefresh('friends', refreshFriends);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          filter: `invitee_user_id=eq.${userId}`,
          schema: 'public',
          table: 'shindig_invites',
        },
        () => {
          scheduleRefresh('notifications', refreshNotifications);
          scheduleRefresh('shindigs', refreshShindigsAndFeed);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shindigs',
        },
        () => {
          scheduleRefresh('shindigs', refreshShindigsAndFeed);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shindig_stops',
        },
        () => {
          scheduleRefresh('shindigs', refreshShindigsAndFeed);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shindig_photos',
        },
        () => {
          scheduleRefresh('shindigs', refreshShindigsAndFeed);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shindig_bring_items',
        },
        () => {
          scheduleRefresh('shindigs', refreshShindigsAndFeed);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          filter: `recipient_user_id=eq.${userId}`,
          schema: 'public',
          table: 'shindig_photo_requests',
        },
        () => {
          scheduleRefresh('notifications', refreshNotifications);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          filter: `requester_user_id=eq.${userId}`,
          schema: 'public',
          table: 'shindig_photo_requests',
        },
        () => {
          scheduleRefresh('notifications', refreshNotifications);
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user) {
      return;
    }

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        scheduleRefresh('notifications', refreshNotifications);
        scheduleRefresh('friends', refreshFriends);
        scheduleRefresh('shindigs', refreshShindigsAndFeed);
      }
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [session?.user?.id]);

  async function handleOpenNotifications() {
    if (!session?.user) {
      return;
    }

    setFriendProfileDetail(null);
    setShowMore(false);
    setShowSettings(false);
    setShowNotifications(true);
    setProfileFriendsDetail(null);
    await markNotificationsRead(session.user.id);
    await refreshNotifications();
  }

  async function handleOpenFriendProfile(friendId: string) {
    const [nextFriends, nextProfile, nextShindigs] = await Promise.all([
      listFriendsForUser(friendId),
      getProfileForUser(friendId),
      listShindigsForUser(friendId),
    ]);

    if (!nextProfile) {
      throw new Error('That friend profile could not be loaded.');
    }

    setShowSettings(false);
    setShowMore(false);
    setProfileFriendsDetail(null);
    setFriendProfileDetail({
      friends: nextFriends,
      profile: {
        ...nextProfile,
        stats: {
          ...nextProfile.stats,
          friends: nextFriends.length,
          shindigs: nextShindigs.length,
        },
      },
      shindigs: nextShindigs,
    });
  }

  function handleOpenOwnFriends() {
    if (!session?.user || !profile) {
      return;
    }

    setShowNotifications(false);
    setShowMore(false);
    setShowSettings(false);
    setFriendProfileDetail(null);
    setProfileFriendsDetail({
      friends,
      ownerId: session.user.id,
      ownerName: profile.name,
      showAddButtons: false,
    });
  }

  function handleOpenViewedFriends() {
    if (!friendProfileDetail) {
      return;
    }

    setProfileFriendsDetail({
      friends: friendProfileDetail.friends,
      ownerName: friendProfileDetail.profile.name,
      showAddButtons: true,
    });
  }

  function handleBackFromFeed() {
    setFeedShindig(null);
    setHighlightedPhotoId(null);
    setPendingShindigStep(null);
    setHideShindigsTabSelection(false);

    if (feedReturnTarget.kind === 'friendProfile') {
      setShowNotifications(false);
      setShowMore(false);
      setShowSettings(false);
      setProfileFriendsDetail(null);
      setActiveTab(feedReturnTarget.tab);
      setFriendProfileDetail(feedReturnTarget.detail);
      return;
    }

    if (feedReturnTarget.kind === 'notifications') {
      setFriendProfileDetail(null);
      setProfileFriendsDetail(null);
      setShowMore(false);
      setShowSettings(false);
      setActiveTab(feedReturnTarget.tab);
      setShowNotifications(true);
      return;
    }

    setFriendProfileDetail(null);
    setProfileFriendsDetail(null);
    setShowNotifications(false);
    setShowMore(false);
    setShowSettings(false);
    setActiveTab(feedReturnTarget.kind === 'tab' ? feedReturnTarget.tab : 'shindigs');
  }

  function handleOpenNotification(notification: AppNotification) {
    if (notification.type === 'shindig_invite' && notification.inviteStatus === 'pending') {
      return;
    }

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
    setShowMore(false);
    setShowSettings(false);
    setFriendProfileDetail(null);
    setFeedReturnTarget({ kind: 'notifications', tab: activeTab });
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
      message: `Accepted friend request from ${profile.name}.`,
      recipientUserId: friendId,
      type: 'friend_accept',
    });
    await resolveFriendRequestNotification({
      actorUserId: friendId,
      recipientUserId: session.user.id,
      resolution: 'accepted',
    });
    await Promise.all([refreshFriends(), refreshNotifications()]);
  }

  async function handleRejectFriendRequest(friendId: string) {
    if (!session?.user || !profile) {
      return;
    }

    await rejectFriendRequest({ friendId, userId: session.user.id });
    await createNotification({
      actorUserId: session.user.id,
      message: `Rejected friend request from ${profile.name}.`,
      recipientUserId: friendId,
      type: 'friend_reject',
    });
    await resolveFriendRequestNotification({
      actorUserId: friendId,
      recipientUserId: session.user.id,
      resolution: 'rejected',
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
      listShindigsForUser(session.user.id, { includeAcceptedInvites: true }),
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

  async function handleAcceptShindigInvite(inviteId: string) {
    if (!session?.user || !profile) {
      return;
    }

    const acceptedInvite = await acceptShindigInvite({
      inviteId,
      userId: session.user.id,
    });
    const [nextShindigs, nextFeed, nextNotifications] = await Promise.all([
      listShindigsForUser(session.user.id, { includeAcceptedInvites: true }),
      listFeedShindigs({
        friendIds: friends.map((friend) => friend.id),
        userId: session.user.id,
      }),
      listNotificationsForUser(session.user.id),
    ]);

    const targetShindig =
      nextShindigs.find((item) => item.id === acceptedInvite.shindig_id) ||
      nextFeed.find((item) => item.id === acceptedInvite.shindig_id) ||
      null;

    await createNotification({
      actorUserId: session.user.id,
      message: `${profile.name} accepted your invite to "${targetShindig?.title || 'your ShinDig'}".`,
      recipientUserId: acceptedInvite.inviter_user_id,
      shindigId: acceptedInvite.shindig_id,
      type: 'shindig_invite',
    });

    setShindigs(nextShindigs);
    setFeedShindigs(nextFeed);
    setNotifications(nextNotifications);
    setShowNotifications(false);
    setShowMore(false);
    setShowSettings(false);
    setFriendProfileDetail(null);
    setHighlightedPhotoId(null);
    if (targetShindig) {
      setFeedShindig(targetShindig);
    }
    setActiveTab('shindigs');
  }

  async function handleAcceptUpcomingShindigInvite(inviteId: string) {
    if (!session?.user || !profile) {
      return;
    }

    const acceptedInvite = await acceptShindigInvite({
      inviteId,
      userId: session.user.id,
    });
    await createNotification({
      actorUserId: session.user.id,
      message: `${profile.name} accepted your invite.`,
      recipientUserId: acceptedInvite.inviter_user_id,
      shindigId: acceptedInvite.shindig_id,
      type: 'shindig_invite',
    });
    await Promise.all([refreshNotifications(), refreshShindigsAndFeed()]);
  }

  async function handleRejectShindigInvite(inviteId: string) {
    if (!session?.user || !profile) {
      return;
    }

    const rejectedInvite = await rejectShindigInvite({
      inviteId,
      userId: session.user.id,
    });

    const targetShindig =
      shindigs.find((item) => item.id === rejectedInvite.shindig_id) ||
      feedShindigs.find((item) => item.id === rejectedInvite.shindig_id) ||
      null;

    await createNotification({
      actorUserId: session.user.id,
      message: `${profile.name} declined your invite to "${targetShindig?.title || 'your ShinDig'}".`,
      recipientUserId: rejectedInvite.inviter_user_id,
      shindigId: rejectedInvite.shindig_id,
      type: 'shindig_invite',
    });

    await refreshNotifications();
  }

  async function handleRejectUpcomingShindigInvite(inviteId: string) {
    if (!session?.user || !profile) {
      return;
    }

    const rejectedInvite = await rejectShindigInvite({
      inviteId,
      userId: session.user.id,
    });
    await createNotification({
      actorUserId: session.user.id,
      message: `${profile.name} declined your invite.`,
      recipientUserId: rejectedInvite.inviter_user_id,
      shindigId: rejectedInvite.shindig_id,
      type: 'shindig_invite',
    });
    await Promise.all([refreshNotifications(), refreshShindigsAndFeed()]);
  }

  async function handleMaybeShindigInvite(inviteId: string) {
    if (!session?.user || !profile) {
      return;
    }

    const maybeInvite = await maybeShindigInvite({
      inviteId,
      userId: session.user.id,
    });

    const targetShindig =
      shindigs.find((item) => item.id === maybeInvite.shindig_id) ||
      feedShindigs.find((item) => item.id === maybeInvite.shindig_id) ||
      null;

    await createNotification({
      actorUserId: session.user.id,
      message: `${profile.name} responded maybe to "${targetShindig?.title || 'your ShinDig'}".`,
      recipientUserId: maybeInvite.inviter_user_id,
      shindigId: maybeInvite.shindig_id,
      type: 'shindig_invite',
    });

    await Promise.all([refreshNotifications(), refreshShindigsAndFeed()]);
  }

  async function handleMaybeUpcomingShindigInvite(inviteId: string) {
    if (!session?.user || !profile) {
      return;
    }

    const maybeInvite = await maybeShindigInvite({
      inviteId,
      userId: session.user.id,
    });
    await createNotification({
      actorUserId: session.user.id,
      message: `${profile.name} responded maybe to your invite.`,
      recipientUserId: maybeInvite.inviter_user_id,
      shindigId: maybeInvite.shindig_id,
      type: 'shindig_invite',
    });
    await Promise.all([refreshNotifications(), refreshShindigsAndFeed()]);
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

  const headerActions = (
    <AuthMenu
      notificationCount={
        showNotifications
          ? 0
          : notifications.filter((item) => !item.readAt).length +
            shindigs.filter(
              (shindig) =>
                shindig.ownerId !== session.user.id && shindig.inviteStatus === 'pending'
            ).length
      }
      onOpenMenu={() => {
        setFriendProfileDetail(null);
        setProfileFriendsDetail(null);
        setShowNotifications(false);
        setShowSettings(false);
        setShowMore(true);
      }}
      onOpenNotifications={handleOpenNotifications}
    />
  );

  return (
    <>
      <StatusBar style="light" />
      <View style={styles.appShell}>
        <View style={styles.screenShell}>
          {showNotifications ? (
            <NotificationsScreen
              headerActions={headerActions}
              onAcceptShindigInvite={handleAcceptShindigInvite}
              notifications={notifications}
              onAcceptFriendRequest={handleAcceptFriendRequest}
              onMaybeShindigInvite={handleMaybeShindigInvite}
              onOpenNotification={handleOpenNotification}
              onApprovePhotoRequest={handleApprovePhotoRequest}
              onBack={() => setShowNotifications(false)}
              onOpenFriend={handleOpenFriendProfile}
              onRejectShindigInvite={handleRejectShindigInvite}
              onRejectPhotoRequest={handleRejectPhotoRequest}
              onRejectFriendRequest={handleRejectFriendRequest}
            />
          ) : showSettings ? (
            <SettingsScreen
              headerActions={headerActions}
              onBack={() => {
                setShowSettings(false);
                setShowMore(true);
              }}
              onProfileSaved={handleProfileSaved}
              profile={profile}
              userId={session.user.id}
            />
          ) : showMore ? (
            <MoreScreen
              headerActions={headerActions}
              onBack={() => setShowMore(false)}
              onOpenSettings={() => {
                setShowMore(false);
                setShowSettings(true);
              }}
              onSignOut={signOut}
            />
          ) : profileFriendsDetail ? (
            <ProfileFriendsScreen
              currentFriends={friends}
              currentUserId={session.user.id}
              currentUserProfile={profile}
              friends={profileFriendsDetail.friends}
              headerActions={headerActions}
              onBack={() => setProfileFriendsDetail(null)}
              onOpenFriend={handleOpenFriendProfile}
              onRefreshCurrentFriends={refreshFriends}
              ownerName={profileFriendsDetail.ownerName}
              showAddButtons={profileFriendsDetail.showAddButtons}
            />
          ) : friendProfileDetail ? (
            <FriendProfileScreen
              headerActions={headerActions}
              onBack={() => setFriendProfileDetail(null)}
              onOpenFriends={handleOpenViewedFriends}
              onOpenShindig={(shindig) => {
                setFeedReturnTarget({
                  detail: friendProfileDetail,
                  kind: 'friendProfile',
                  tab: activeTab,
                });
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
              headerActions={headerActions}
              onOpenFriend={handleOpenFriendProfile}
              onOpenShindig={(shindig) => {
                setFeedReturnTarget({ kind: 'tab', tab: 'home' });
                setFeedShindig(shindig);
                setPendingShindigStep(null);
                setActiveTab('shindigs');
              }}
              onRefresh={async () => {
                await refreshShindigsAndFeed();
              }}
              scrollToTopSignal={homeScrollToTopSignal}
            />
          ) : null}
          {!showNotifications &&
          !showMore &&
          !showSettings &&
          !friendProfileDetail &&
          !profileFriendsDetail &&
          activeTab === 'friends' ? (
            <FriendsScreen
              friends={friends}
              headerActions={headerActions}
              onFriendsChanged={refreshFriends}
              onOpenFriend={handleOpenFriendProfile}
              onOpenProfile={() => setActiveTab('profile')}
              profile={profile}
              userId={session.user.id}
            />
          ) : null}
          {!showNotifications &&
          !showMore &&
          !showSettings &&
          !friendProfileDetail &&
          !profileFriendsDetail &&
          activeTab === 'shindigs' ? (
            <HomeScreen
              friends={friends}
              headerActions={headerActions}
              initialFeedShindig={feedShindig}
              initialHighlightedPhotoId={highlightedPhotoId}
              initialStep={pendingShindigStep}
              onBackFromFeed={handleBackFromFeed}
              onFlowStepChange={(step) => {
                setHideShindigsTabSelection(step === 'create' || step === 'invite');
              }}
              onConsumeInitialFeedShindig={() => setFeedShindig(null)}
              onConsumeInitialHighlightedPhotoId={() => setHighlightedPhotoId(null)}
              onConsumeInitialStep={() => setPendingShindigStep(null)}
              onAcceptUpcomingInvite={handleAcceptUpcomingShindigInvite}
              onMaybeUpcomingInvite={handleMaybeUpcomingShindigInvite}
              onRejectUpcomingInvite={handleRejectUpcomingShindigInvite}
              onShindigSaved={handleShindigSaved}
              onShindigDeleted={handleShindigDeleted}
              onShindigCoverPhotoChanged={handleShindigCoverPhotoChanged}
              onShindigPhotoDeleted={handleShindigPhotoDeleted}
              onShindigStateChanged={handleShindigStateChanged}
              profile={profile}
              shindigs={shindigs}
              userId={session.user.id}
            />
          ) : null}
          {!showNotifications &&
          !showMore &&
          !showSettings &&
          !friendProfileDetail &&
          !profileFriendsDetail &&
          activeTab === 'profile' ? (
            <ProfileScreen
              headerActions={headerActions}
              onBackHome={() => setActiveTab('home')}
              onOpenFriends={handleOpenOwnFriends}
              onOpenShindig={(shindig) => {
                setFeedReturnTarget({ kind: 'tab', tab: 'profile' });
                setFeedShindig(shindig);
                setActiveTab('shindigs');
              }}
              profile={profile}
              shindigs={shindigs}
            />
          ) : null}
        </View>
        {!showNotifications &&
        !showMore &&
        !showSettings &&
        !friendProfileDetail &&
        !profileFriendsDetail ? (
          <BottomNav
            activeTab={
              activeTab === 'shindigs' && hideShindigsTabSelection ? null : activeTab
            }
            onCreateShindig={() => {
              setShowNotifications(false);
              setShowMore(false);
              setShowSettings(false);
              setFriendProfileDetail(null);
              setProfileFriendsDetail(null);
              setFeedShindig(null);
              setHighlightedPhotoId(null);
              setPendingShindigStep('create');
              setHideShindigsTabSelection(true);
              setActiveTab('shindigs');
            }}
            onSelectTab={(tab) => {
              if (tab === 'home' && activeTab === 'home') {
                setHomeScrollToTopSignal((current) => current + 1);
                return;
              }

              setShowNotifications(false);
              setShowMore(false);
              setShowSettings(false);
              setFriendProfileDetail(null);
              setProfileFriendsDetail(null);
              if (tab === 'shindigs') {
                setFeedShindig(null);
                setHighlightedPhotoId(null);
                setPendingShindigStep('welcome');
              }
              setHideShindigsTabSelection(false);
              setActiveTab(tab);
            }}
          />
        ) : null}
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
