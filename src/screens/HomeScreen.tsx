import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import * as Contacts from 'expo-contacts';
import * as FileSystem from 'expo-file-system/legacy';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as SMS from 'expo-sms';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import {
  ActionSheetIOS,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PageHeader } from '../components/PageHeader';
import { ProgressiveImage } from '../components/ProgressiveImage';
import { generateShindigCover } from '../lib/ai';
import { searchPlaces } from '../lib/places';
import { createNotification } from '../lib/notifications';
import {
  addBringItem,
  addPhotoToShindig,
  addPhotoComment,
  addShindigComment,
  claimBringItem,
  createAppFriendShindigInvites,
  createPhoneShindigInvite,
  deleteBringItem,
  deletePhotoComment,
  deleteShindigComment,
  getShindigById,
  listPhotoLikeProfiles,
  togglePhotoLike,
  toggleShindigLike,
  unclaimBringItem,
} from '../lib/shindigs';
import { searchProfilesByUsername } from '../lib/profiles';
import { supabase } from '../lib/supabase';
import { theme } from '../theme';
import {
  FriendProfile,
  SavedShindig,
  ShindigBringItem,
  ShindigInviteParticipant,
  SavedShindigPhoto,
  ShindigState,
  TimelinePlace,
  UserProfile,
} from '../types/models';

type HomeScreenProps = {
  friends: FriendProfile[];
  headerActions?: React.ReactNode;
  onBackFromFeed?: () => void;
  initialFeedShindig?: SavedShindig | null;
  initialHighlightedPhotoId?: string | null;
  initialStep?: 'create' | 'welcome' | null;
  onAcceptUpcomingInvite?: (inviteId: string) => Promise<void>;
  onFlowStepChange?: (step: FlowStep) => void;
  onConsumeInitialFeedShindig?: () => void;
  onConsumeInitialHighlightedPhotoId?: () => void;
  onConsumeInitialStep?: () => void;
  onMaybeUpcomingInvite?: (inviteId: string) => Promise<void>;
  onRejectUpcomingInvite?: (inviteId: string) => Promise<void>;
  onShindigSaved: (args: {
    plannedFor?: string | null;
    state?: ShindigState;
    stops: {
      photos: DraftPhoto[];
      place: TimelinePlace;
      scheduledTime?: string;
    }[];
    title: string;
    userId: string;
  }) => Promise<SavedShindig>;
  onShindigDeleted: (shindigId: string) => Promise<void>;
  onShindigCoverPhotoChanged: (args: {
    photoId: string;
    shindigId: string;
  }) => Promise<SavedShindig>;
  onShindigPhotoDeleted: (args: {
    photoId: string;
    shindigId: string;
  }) => Promise<SavedShindig | null>;
  onShindigStateChanged: (args: {
    shindigId: string;
    state: ShindigState;
  }) => Promise<SavedShindig>;
  profile: UserProfile;
  shindigs: SavedShindig[];
  userId: string;
};

type FlowStep = 'welcome' | 'create' | 'invite' | 'feed';

type DraftPhoto = {
  base64: string;
  contentType?: string;
  fileExtension?: string;
  isPreferredCover?: boolean;
  localUri: string;
};

type InviteContact = {
  id: string;
  name: string;
  phoneNumber: string;
};

const INVITE_LINK_BASE = 'shindig://signup';
function buildManualPlace(query: string): TimelinePlace {
  const normalizedQuery = query.trim();

  return {
    address: normalizedQuery,
    durationLabel: '',
    id: `manual-${normalizedQuery.toLowerCase().replace(/\s+/g, '-')}`,
    latitude: 0,
    longitude: 0,
    title: normalizedQuery,
    transitMinutes: 0,
    transitMiles: 0,
    type: 'Custom location',
    vibeIds: [],
  };
}

function formatDateLabel(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatPlannedDateLabel(value: string) {
  return new Date(value).toLocaleString('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  });
}

function formatPlannedTimeLabel(value: string) {
  return new Date(value).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCommentTimestamp(value: string) {
  return new Date(value).toLocaleString('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  });
}

function formatRelativeTimestamp(value: string) {
  const createdAt = new Date(value).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - createdAt);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (diffMs < minuteMs) {
    return 'Just now';
  }

  if (diffMs < hourMs) {
    const minutes = Math.floor(diffMs / minuteMs);
    return `${minutes}m ago`;
  }

  if (diffMs < dayMs) {
    const hours = Math.floor(diffMs / hourMs);
    return `${hours}h ago`;
  }

  if (diffMs < 7 * dayMs) {
    const days = Math.floor(diffMs / dayMs);
    return `${days}d ago`;
  }

  return new Date(value).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
  });
}

function fileExtensionFromUri(uri: string) {
  return uri.match(/\.(\w+)(?:\?|$)/)?.[1]?.toLowerCase() || 'jpg';
}

function mimeTypeFromExtension(extension: string) {
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'heic':
      return 'image/heic';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}

function fileExtensionFromMimeType(mimeType: string) {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/heic':
      return 'heic';
    default:
      return 'jpg';
  }
}

function contactDisplayName(contact: Contacts.Contact) {
  const fullName = contact.name?.trim();
  if (fullName) {
    return fullName;
  }

  const joinedName = [contact.firstName?.trim(), contact.lastName?.trim()]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (joinedName) {
    return joinedName;
  }

  return getContactPhoneValue(contact);
}

function getContactPhoneValue(contact: Contacts.Contact) {
  const firstPhone = contact.phoneNumbers?.find(
    (phone) => phone.number?.trim() || phone.digits?.trim()
  );

  if (!firstPhone) {
    return '';
  }

  const formattedNumber = firstPhone.number?.trim();
  if (formattedNumber) {
    return formattedNumber;
  }

  const digits = firstPhone.digits?.trim();
  if (!digits) {
    return '';
  }

  return firstPhone.countryCode ? `+${firstPhone.countryCode}${digits}` : digits;
}

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function editDistanceWithinOne(left: string, right: string) {
  if (left === right) {
    return true;
  }

  if (Math.abs(left.length - right.length) > 1) {
    return false;
  }

  let indexLeft = 0;
  let indexRight = 0;
  let mismatchCount = 0;

  while (indexLeft < left.length && indexRight < right.length) {
    if (left[indexLeft] === right[indexRight]) {
      indexLeft += 1;
      indexRight += 1;
      continue;
    }

    mismatchCount += 1;
    if (mismatchCount > 1) {
      return false;
    }

    if (left.length > right.length) {
      indexLeft += 1;
    } else if (right.length > left.length) {
      indexRight += 1;
    } else {
      indexLeft += 1;
      indexRight += 1;
    }
  }

  if (indexLeft < left.length || indexRight < right.length) {
    mismatchCount += 1;
  }

  return mismatchCount <= 1;
}

function fuzzyMatchesQuery(candidate: string, query: string) {
  const normalizedCandidate = normalizeSearchValue(candidate);
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) {
    return true;
  }

  if (normalizedCandidate.includes(normalizedQuery)) {
    return true;
  }

  const candidateParts = candidate
    .toLowerCase()
    .split(/[\s,.-]+/)
    .map(normalizeSearchValue)
    .filter(Boolean);

  return candidateParts.some(
    (part) =>
      part.startsWith(normalizedQuery) ||
      normalizedQuery.startsWith(part) ||
      editDistanceWithinOne(part, normalizedQuery)
  );
}

function getPhotoNotificationRecipient(
  shindig: SavedShindig,
  photoId: string
) {
  const targetPhoto = shindig.stops.flatMap((stop) => stop.photos).find((photo) => photo.id === photoId);
  return targetPhoto?.contributor?.id || shindig.ownerId;
}

function shindigStateLabel(state: ShindigState) {
  if (state === 'planned') {
    return 'Upcoming';
  }

  return state === 'active' ? 'Active' : 'Completed';
}

function sortPhotosNewestFirst<T extends { createdAt: string }>(photos: T[]) {
  return [...photos].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

function buildCurrentUserProfile(profile: UserProfile, userId: string): FriendProfile {
  return {
    avatar: profile.avatar,
    city: profile.city,
    handle: profile.handle,
    id: userId,
    name: profile.name,
  };
}

function upcomingBringActivityRecipientIds(shindig: SavedShindig, actorUserId: string) {
  if (shindig.state !== 'planned') {
    return [];
  }

  return Array.from(
    new Set([
      ...shindig.inviteParticipants
        .filter((participant) => participant.status === 'accepted')
        .map((participant) => participant.profile.id),
      shindig.ownerId,
    ])
  ).filter((recipientUserId) => recipientUserId !== actorUserId);
}

type UpcomingActivityItem = {
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  id: string;
  imageUrl?: string;
  title: string;
};

function uniqueProfiles(profiles: FriendProfile[]) {
  return Array.from(new Map(profiles.map((profile) => [profile.id, profile])).values());
}

function buildAttendeeGroups(shindig: SavedShindig) {
  const accepted = uniqueProfiles(
    shindig.inviteParticipants
      .filter((participant) => participant.status === 'accepted')
      .map((participant) => participant.profile)
  );
  const maybe = uniqueProfiles(
    shindig.inviteParticipants
      .filter((participant) => participant.status === 'maybe')
      .map((participant) => participant.profile)
  );
  const pending = uniqueProfiles(
    shindig.inviteParticipants
      .filter((participant) => participant.status === 'pending')
      .map((participant) => participant.profile)
  );

  return { accepted, maybe, pending };
}

function buildUpcomingActivityItems(args: {
  ownerName: string;
  shindig: SavedShindig;
}): UpcomingActivityItem[] {
  const photoItems = args.shindig.stops
    .flatMap((stop) => stop.photos)
    .map((photo) => ({
      createdAt: photo.createdAt,
      detail: formatRelativeTimestamp(photo.createdAt),
      icon: 'camera' as const,
      id: `photo-${photo.id}`,
      imageUrl: photo.thumbnailUrl || photo.photoUrl,
      title: `${photo.contributor?.name || args.ownerName} uploaded a photo`,
    }));

  const bringItems = args.shindig.bringItems
    .filter((item) => item.claimedBy && item.claimedAt)
    .map((item) => ({
      createdAt: item.claimedAt || item.createdAt,
      detail: formatRelativeTimestamp(item.claimedAt || item.createdAt),
      icon: 'gift' as const,
      id: `bring-${item.id}`,
      title: `${item.claimedBy?.name || 'Someone'} claimed ${item.label}`,
    }));

  const commentItems = args.shindig.comments.map((comment) => ({
    createdAt: comment.createdAt,
    detail: formatRelativeTimestamp(comment.createdAt),
    icon: 'chatbubble-ellipses' as const,
    id: `comment-${comment.id}`,
    title: `${comment.author.name} commented`,
  }));

  return [...photoItems, ...bringItems, ...commentItems]
    .sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    )
    .slice(0, 6)
    .map(({ createdAt: _createdAt, ...item }) => item);
}

export function HomeScreen({
  friends,
  headerActions,
  onBackFromFeed,
  initialFeedShindig,
  initialHighlightedPhotoId,
  initialStep,
  onAcceptUpcomingInvite,
  onFlowStepChange,
  onConsumeInitialFeedShindig,
  onConsumeInitialHighlightedPhotoId,
  onConsumeInitialStep,
  onMaybeUpcomingInvite,
  onRejectUpcomingInvite,
  onShindigSaved,
  onShindigDeleted,
  onShindigCoverPhotoChanged,
  onShindigPhotoDeleted,
  onShindigStateChanged,
  profile,
  shindigs,
  userId,
}: HomeScreenProps) {
  const [step, setStep] = useState<FlowStep>('welcome');
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [aiCoverPrompt, setAiCoverPrompt] = useState('');
  const [isAiCoverModalOpen, setIsAiCoverModalOpen] = useState(false);
  const [isGeneratingAiCover, setIsGeneratingAiCover] = useState(false);
  const [shindigName, setShindigName] = useState('');
  const [shindigTiming, setShindigTiming] = useState<'now' | 'planned'>('planned');
  const [plannedFor, setPlannedFor] = useState<Date>(() => {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(19, 0, 0, 0);
    return next;
  });
  const [showPlannedDatePicker, setShowPlannedDatePicker] = useState(false);
  const [showPlannedTimePicker, setShowPlannedTimePicker] = useState(false);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationResults, setLocationResults] = useState<TimelinePlace[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<TimelinePlace | null>(null);
  const [contacts, setContacts] = useState<InviteContact[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [inviteSearchResults, setInviteSearchResults] = useState<FriendProfile[]>([]);
  const [selectedInviteUsersById, setSelectedInviteUsersById] = useState<
    Record<string, FriendProfile>
  >({});
  const [selectedContactsById, setSelectedContactsById] = useState<Record<string, InviteContact>>(
    {}
  );
  const [inviteSearch, setInviteSearch] = useState('');
  const [isInvitePickerOpen, setIsInvitePickerOpen] = useState(false);
  const [isSearchingInviteUsers, setIsSearchingInviteUsers] = useState(false);
  const [activeFeedShindig, setActiveFeedShindig] = useState<SavedShindig | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObjectCoords | null>(
    null
  );
  const [locationHint, setLocationHint] = useState('');
  const [error, setError] = useState('');
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [isSearchingLocations, setIsSearchingLocations] = useState(false);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [isSavingShindig, setIsSavingShindig] = useState(false);
  const [isRefreshingFeed, setIsRefreshingFeed] = useState(false);
  const [isAddingPhotoToShindig, setIsAddingPhotoToShindig] = useState(false);
  const [shindigCommentDraft, setShindigCommentDraft] = useState('');
  const [photoCommentDrafts, setPhotoCommentDrafts] = useState<Record<string, string>>({});
  const [showPhotoRequestPrompt, setShowPhotoRequestPrompt] = useState(false);
  const [showOwnerPhotoPrompt, setShowOwnerPhotoPrompt] = useState(false);
  const [showCoverPhotoSavedNotice, setShowCoverPhotoSavedNotice] = useState(false);
  const [highlightedPhotoId, setHighlightedPhotoId] = useState('');
  const [feedBackMode, setFeedBackMode] = useState<'external' | 'welcome'>('welcome');
  const [expandedPhoto, setExpandedPhoto] = useState<SavedShindigPhoto | null>(null);
  const [actingUpcomingInviteId, setActingUpcomingInviteId] = useState('');
  const [bringItemDraft, setBringItemDraft] = useState('');
  const [customBringItemDraft, setCustomBringItemDraft] = useState('');
  const [actingBringItemId, setActingBringItemId] = useState('');
  const [showAllUpcomingBringItems, setShowAllUpcomingBringItems] = useState(false);
  const [plannedFeedViewMode, setPlannedFeedViewMode] = useState<'feed' | 'overview'>('overview');
  const [isLikeSheetVisible, setIsLikeSheetVisible] = useState(false);
  const [isLoadingLikeSheet, setIsLoadingLikeSheet] = useState(false);
  const [likeSheetProfiles, setLikeSheetProfiles] = useState<FriendProfile[]>([]);
  const [likeSheetTitle, setLikeSheetTitle] = useState('Liked by');
  const deferredLocationQuery = useDeferredValue(locationQuery);
  const feedScrollRef = useRef<ScrollView | null>(null);
  const photoOffsetsRef = useRef<Record<string, number>>({});
  const sectionOffsetsRef = useRef<Record<string, number>>({});
  const activeFeedRefreshIdRef = useRef(0);
  const contactsRequestIdRef = useRef(0);
  const coverPhotoSavedNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredFriends = useMemo(() => {
    const query = inviteSearch.trim();
    if (!query) {
      return friends;
    }

    return friends.filter(
      (friend) =>
        fuzzyMatchesQuery(friend.name, query) ||
        fuzzyMatchesQuery(friend.handle, query) ||
        fuzzyMatchesQuery(friend.city, query)
    );
  }, [friends, inviteSearch]);

  const filteredContacts = useMemo(() => {
    const query = inviteSearch.trim();
    if (!query) {
      return contacts;
    }

    return contacts.filter(
      (contact) =>
        fuzzyMatchesQuery(contact.name, query) ||
        fuzzyMatchesQuery(contact.phoneNumber, query)
    );
  }, [contacts, inviteSearch]);

  const selectedContacts = useMemo(
    () => Object.values(selectedContactsById),
    [selectedContactsById]
  );
  const selectedFriends = useMemo(
    () => friends.filter((friend) => selectedFriendIds.includes(friend.id)),
    [friends, selectedFriendIds]
  );
  const selectedInviteUsers = useMemo(
    () => Object.values(selectedInviteUsersById),
    [selectedInviteUsersById]
  );
  const activeShindigs = useMemo(
    () => shindigs.filter((shindig) => shindig.state === 'active'),
    [shindigs]
  );
  const plannedShindigs = useMemo(
    () =>
      shindigs
        .filter((shindig) => shindig.state === 'planned')
        .sort((left, right) => {
          const leftTime = left.plannedFor ? new Date(left.plannedFor).getTime() : 0;
          const rightTime = right.plannedFor ? new Date(right.plannedFor).getTime() : 0;
          return leftTime - rightTime;
        }),
    [shindigs]
  );
  const completedShindigs = useMemo(
    () => shindigs.filter((shindig) => shindig.state === 'completed'),
    [shindigs]
  );
  const activeFeedOwner = useMemo(() => {
    if (!activeFeedShindig) {
      return null;
    }

    if (activeFeedShindig.ownerId === userId) {
      return {
        handle: profile.handle,
        name: profile.name,
      };
    }

    const owner = friends.find((friend) => friend.id === activeFeedShindig.ownerId);
    if (owner) {
      return {
        handle: owner.handle,
        name: owner.name,
      };
    }

    return null;
  }, [activeFeedShindig, friends, profile.handle, profile.name, userId]);
  const activeFeedCreatorLabel = useMemo(() => {
    if (!activeFeedShindig) {
      return '';
    }

    if (activeFeedShindig.ownerId === userId) {
      return 'created by you';
    }

    return `created by ${activeFeedOwner?.handle || '@user'}`;
  }, [activeFeedOwner, activeFeedShindig, userId]);
  const canCurrentUserClaimBringItems = useMemo(
    () =>
      Boolean(
        activeFeedShindig &&
          activeFeedShindig.state === 'planned' &&
          activeFeedShindig.ownerId !== userId &&
          activeFeedShindig.inviteStatus &&
          activeFeedShindig.inviteStatus !== 'rejected'
      ),
    [activeFeedShindig, userId]
  );
  const standardBringItems = useMemo(
    () => activeFeedShindig?.bringItems.filter((item) => !item.isCustom) || [],
    [activeFeedShindig]
  );
  const customBringItems = useMemo(
    () => activeFeedShindig?.bringItems.filter((item) => item.isCustom) || [],
    [activeFeedShindig]
  );
  const displayedStandardBringItems = useMemo(
    () => (showAllUpcomingBringItems ? standardBringItems : standardBringItems.slice(0, 4)),
    [showAllUpcomingBringItems, standardBringItems]
  );
  const displayedCustomBringItems = useMemo(
    () => (showAllUpcomingBringItems ? customBringItems : customBringItems.slice(0, 2)),
    [customBringItems, showAllUpcomingBringItems]
  );
  const upcomingAttendeeGroups = useMemo(
    () =>
      activeFeedShindig
        ? buildAttendeeGroups(activeFeedShindig)
        : { accepted: [], maybe: [], pending: [] as FriendProfile[] },
    [activeFeedShindig]
  );
  const upcomingActivity = useMemo(
    () =>
      activeFeedShindig
        ? buildUpcomingActivityItems({
            ownerName: activeFeedOwner?.name || 'ShinDig host',
            shindig: activeFeedShindig,
          })
        : [],
    [activeFeedOwner?.name, activeFeedShindig]
  );

  useEffect(() => {
    onFlowStepChange?.(step);
  }, [onFlowStepChange, step]);

  useEffect(() => {
    if (!initialFeedShindig) {
      return;
    }

    setError('');
    setPlannedFeedViewMode('overview');
    setActiveFeedShindig(initialFeedShindig);
    setFeedBackMode('external');
    setStep('feed');
    onConsumeInitialFeedShindig?.();
  }, [initialFeedShindig, onConsumeInitialFeedShindig]);

  useEffect(() => {
    if (!initialStep) {
      return;
    }

    if (initialStep === 'create') {
      goToCreate();
    } else {
      setError('');
      setActiveFeedShindig(null);
      setShowPhotoRequestPrompt(false);
      setShowOwnerPhotoPrompt(false);
      setHighlightedPhotoId('');
      setStep('welcome');
    }
    onConsumeInitialStep?.();
  }, [initialStep, onConsumeInitialStep]);

  useEffect(() => {
    if (step !== 'feed' || !activeFeedShindig) {
      return;
    }

    const matchingShindig = shindigs.find((shindig) => shindig.id === activeFeedShindig.id);
    if (!matchingShindig) {
      return;
    }

    setActiveFeedShindig((current) =>
      current?.id === matchingShindig.id ? matchingShindig : current
    );
  }, [activeFeedShindig?.id, shindigs, step]);

  useEffect(() => {
    if (!initialHighlightedPhotoId) {
      return;
    }

    setHighlightedPhotoId(initialHighlightedPhotoId);
    onConsumeInitialHighlightedPhotoId?.();
  }, [initialHighlightedPhotoId, onConsumeInitialHighlightedPhotoId]);

  useEffect(() => {
    if (step !== 'feed' || !highlightedPhotoId) {
      return;
    }

    const nextOffset = photoOffsetsRef.current[highlightedPhotoId];
    if (typeof nextOffset !== 'number') {
      return;
    }

    feedScrollRef.current?.scrollTo({
      animated: true,
      y: Math.max(nextOffset - 120, 0),
    });
  }, [highlightedPhotoId, step, activeFeedShindig]);

  useEffect(() => {
    let isMounted = true;

    async function runInviteUserSearch() {
      const query = inviteSearch.trim();
      if (!isInvitePickerOpen || query.length < 2) {
        setInviteSearchResults([]);
        setIsSearchingInviteUsers(false);
        return;
      }

      setIsSearchingInviteUsers(true);
      try {
        const nextResults = await searchProfilesByUsername({
          currentUserId: userId,
          excludedUserIds: friends.map((friend) => friend.id),
          query,
        });

        if (isMounted) {
          setInviteSearchResults(nextResults);
        }
      } catch (nextError) {
        if (isMounted) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to search ShinDig users.');
        }
      } finally {
        if (isMounted) {
          setIsSearchingInviteUsers(false);
        }
      }
    }

    void runInviteUserSearch();

    return () => {
      isMounted = false;
    };
  }, [friends, inviteSearch, isInvitePickerOpen, userId]);

  useEffect(() => {
    let isMounted = true;

    async function loadCurrentLocation() {
      setIsLoadingLocation(true);
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!isMounted || permission.status !== 'granted') {
          return;
        }

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (isMounted) {
          setCurrentLocation(location.coords);
        }

        const reverseGeocode = await Location.reverseGeocodeAsync({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        const firstResult = reverseGeocode[0];
        const hint = [firstResult?.city || firstResult?.district, firstResult?.region]
          .filter(Boolean)
          .join(', ');

        if (isMounted) {
          setLocationHint(hint);
        }
      } catch (nextError) {
        if (isMounted) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : 'Unable to determine your location right now.'
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingLocation(false);
        }
      }
    }

    loadCurrentLocation();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const searchQuery = deferredLocationQuery.trim();

    async function runLocationSearch() {
      if (searchQuery.length < 2) {
        setLocationResults([]);
        return;
      }

      setIsSearchingLocations(true);
      try {
        const results = await searchPlaces({
          localityHint: locationHint || undefined,
          mode: 'instant',
          near: currentLocation
            ? {
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
              }
            : undefined,
          query: searchQuery,
        });

        if (isMounted) {
          setLocationResults(results);
        }
      } catch (nextError) {
        if (isMounted) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : 'Could not search locations right now.'
          );
        }
      } finally {
        if (isMounted) {
          setIsSearchingLocations(false);
        }
      }
    }

    runLocationSearch();

    return () => {
      isMounted = false;
    };
  }, [currentLocation, deferredLocationQuery, locationHint]);

  async function handlePickFromLibrary() {
    setError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo library access is required to add photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: shindigTiming !== 'planned',
      base64: true,
      mediaTypes: ['images'],
      quality: 0.6,
      selectionLimit: shindigTiming === 'planned' ? 1 : 10,
    });

    if (result.canceled) {
      return;
    }

    const nextPhotos = result.assets
      .filter((asset) => asset.base64 && asset.uri)
      .map<DraftPhoto>((asset) => ({
        base64: asset.base64!,
        contentType: asset.mimeType,
        fileExtension: fileExtensionFromUri(asset.uri),
        isPreferredCover: shindigTiming === 'planned',
        localUri: asset.uri,
      }));

    setPhotos((current) =>
      shindigTiming === 'planned' ? nextPhotos.slice(0, 1) : [...current, ...nextPhotos]
    );
  }

  async function handleTakePhoto() {
    setError('');
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Camera access is required to take a photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      mediaTypes: ['images'],
      quality: 0.6,
    });

    if (result.canceled || !result.assets[0]?.base64 || !result.assets[0]?.uri) {
      return;
    }

    const asset = result.assets[0];
    const nextPhoto = {
      base64: asset.base64!,
      contentType: asset.mimeType,
      fileExtension: fileExtensionFromUri(asset.uri),
      isPreferredCover: shindigTiming === 'planned',
      localUri: asset.uri,
    } satisfies DraftPhoto;

    setPhotos((current) => (shindigTiming === 'planned' ? [nextPhoto] : [...current, nextPhoto]));
  }

  function openPhotoSourcePicker() {
    const options = ['Take Photo', 'Select From Library', 'Cancel'];
    const cancelButtonIndex = 2;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          cancelButtonIndex,
          options,
          title: shindigTiming === 'planned' ? 'Choose Cover Photo' : 'Add Photo',
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            void handleTakePhoto();
          }

          if (buttonIndex === 1) {
            void handlePickFromLibrary();
          }
        }
      );
      return;
    }

    Alert.alert(
      shindigTiming === 'planned' ? 'Choose Cover Photo' : 'Add Photo',
      shindigTiming === 'planned'
        ? 'Choose the single cover photo for this upcoming ShinDig.'
        : 'Choose a photo source.',
      [
      {
        onPress: () => {
          void handleTakePhoto();
        },
        text: 'Take Photo',
      },
      {
        onPress: () => {
          void handlePickFromLibrary();
        },
        text: 'Select From Library',
      },
      {
        style: 'cancel',
        text: 'Cancel',
      },
      ]
    );
  }

  async function pickSinglePhoto(source: 'camera' | 'library', messages: {
    cameraPermission: string;
    libraryPermission: string;
  }) {
    let result: ImagePicker.ImagePickerResult;

    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError(messages.cameraPermission);
        return null;
      }

      result = await ImagePicker.launchCameraAsync({
        base64: true,
        mediaTypes: ['images'],
        quality: 0.6,
      });
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError(messages.libraryPermission);
        return null;
      }

      result = await ImagePicker.launchImageLibraryAsync({
        base64: true,
        mediaTypes: ['images'],
        quality: 0.6,
        selectionLimit: 1,
      });
    }

    if (result.canceled || !result.assets[0]?.base64 || !result.assets[0]?.uri) {
      return null;
    }

    const asset = result.assets[0];
    const base64 = asset.base64;
    if (!base64) {
      return null;
    }

    return {
      base64,
      contentType: asset.mimeType,
      fileExtension: fileExtensionFromUri(asset.uri),
      localUri: asset.uri,
    } satisfies DraftPhoto;
  }

  function removePhoto(localUri: string) {
    setPhotos((current) => current.filter((photo) => photo.localUri !== localUri));
  }

  function openAiCoverPrompt() {
    setError('');
    const promptSeed = [
      shindigName.trim() ? `Theme around ${shindigName.trim()}` : '',
      locationQuery.trim() ? `at ${locationQuery.trim()}` : '',
      'stylish event cover, nightlife editorial, cinematic lighting',
    ]
      .filter(Boolean)
      .join(', ');
    setAiCoverPrompt((current) => current || promptSeed);
    setIsAiCoverModalOpen(true);
  }

  async function handleGenerateAiCover() {
    const prompt = aiCoverPrompt.trim();
    if (!prompt) {
      setError('Enter a prompt for the AI-generated cover image.');
      return;
    }

    setIsGeneratingAiCover(true);
    setError('');

    try {
      const generated = await generateShindigCover({
        location: locationQuery.trim() || selectedLocation?.title,
        prompt,
        scheduledFor: plannedFor.toISOString(),
        title: shindigName.trim(),
      });

      const extension = fileExtensionFromMimeType(generated.mimeType);
      const generatedPhoto = {
        base64: generated.base64,
        contentType: generated.mimeType,
        fileExtension: extension,
        isPreferredCover: true,
        localUri: `data:${generated.mimeType};base64,${generated.base64}`,
      } satisfies DraftPhoto;

      setPhotos((current) => [
        generatedPhoto,
        ...current.map((photo) => ({ ...photo, isPreferredCover: false })),
      ]);
      setIsAiCoverModalOpen(false);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Could not generate an AI cover image right now.'
      );
    } finally {
      setIsGeneratingAiCover(false);
    }
  }

  function selectLocation(place: TimelinePlace) {
    setSelectedLocation(place);
    setLocationQuery(place.title);
    setLocationResults([]);
  }

  function goToCreate() {
    contactsRequestIdRef.current += 1;
    setError('');
    setSelectedLocation(null);
    setLocationQuery('');
    setLocationResults([]);
    setPhotos([]);
    setAiCoverPrompt('');
    setIsAiCoverModalOpen(false);
    setIsGeneratingAiCover(false);
    setShindigName('');
    setShindigTiming('planned');
    const nextPlannedDate = new Date();
    nextPlannedDate.setDate(nextPlannedDate.getDate() + 1);
    nextPlannedDate.setHours(19, 0, 0, 0);
    setPlannedFor(nextPlannedDate);
    setShowPlannedDatePicker(false);
    setShowPlannedTimePicker(false);
    setSelectedFriendIds([]);
    setSelectedInviteUsersById({});
    setSelectedContactsById({});
    setInviteSearch('');
    setInviteSearchResults([]);
    setBringItemDraft('');
    setCustomBringItemDraft('');
    setShowAllUpcomingBringItems(false);
    setPlannedFeedViewMode('overview');
    setIsInvitePickerOpen(false);
    setContacts([]);
    setActiveFeedShindig(null);
    setFeedBackMode('welcome');
    setStep('create');
  }

  function openPastShindig(shindig: SavedShindig) {
    setError('');
    setBringItemDraft('');
    setCustomBringItemDraft('');
    setShowAllUpcomingBringItems(false);
    setPlannedFeedViewMode('overview');
    setActiveFeedShindig(shindig);
    setFeedBackMode('welcome');
    setStep('feed');
  }

  async function refreshActiveFeed(shindigId: string) {
    const refreshId = activeFeedRefreshIdRef.current + 1;
    activeFeedRefreshIdRef.current = refreshId;
    setIsRefreshingFeed(true);

    try {
      const refreshed = await getShindigById({
        shindigId,
        userId,
      });

      if (refreshId !== activeFeedRefreshIdRef.current) {
        return;
      }

      if (refreshed) {
        setActiveFeedShindig(refreshed);
      } else {
        setActiveFeedShindig(null);
        setShowOwnerPhotoPrompt(false);
        setShowPhotoRequestPrompt(false);
        setShowCoverPhotoSavedNotice(false);
        setHighlightedPhotoId('');
        setStep('welcome');
      }
    } finally {
      if (refreshId === activeFeedRefreshIdRef.current) {
        setIsRefreshingFeed(false);
      }
    }
  }

  useEffect(() => {
    if (!supabase || step !== 'feed' || !activeFeedShindig) {
      return;
    }

    const shindigId = activeFeedShindig.id;
    const client = supabase;
    const channel = client
      .channel(`shindig-feed-live:${shindigId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          filter: `id=eq.${shindigId}`,
          schema: 'public',
          table: 'shindigs',
        },
        () => {
          void refreshActiveFeed(shindigId);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          filter: `shindig_id=eq.${shindigId}`,
          schema: 'public',
          table: 'shindig_likes',
        },
        () => {
          void refreshActiveFeed(shindigId);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          filter: `shindig_id=eq.${shindigId}`,
          schema: 'public',
          table: 'shindig_comments',
        },
        () => {
          void refreshActiveFeed(shindigId);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          filter: `shindig_id=eq.${shindigId}`,
          schema: 'public',
          table: 'shindig_photos',
        },
        () => {
          void refreshActiveFeed(shindigId);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          filter: `shindig_id=eq.${shindigId}`,
          schema: 'public',
          table: 'shindig_bring_items',
        },
        () => {
          void refreshActiveFeed(shindigId);
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [activeFeedShindig?.id, step]);

  useEffect(() => {
    if (step !== 'feed' || !activeFeedShindig || activeFeedShindig.state !== 'planned') {
      return;
    }

    const shindigId = activeFeedShindig.id;
    const intervalId = setInterval(() => {
      void refreshActiveFeed(shindigId);
    }, 3000);

    return () => {
      clearInterval(intervalId);
    };
  }, [activeFeedShindig?.id, activeFeedShindig?.state, step]);

  async function continueToInvite() {
    if (!shindigName.trim()) {
      setError('Name your shindig before continuing.');
      return;
    }

    if (photos.length === 0) {
      setError('Add at least one photo before continuing.');
      return;
    }

    if (photos.length > 1) {
      setError('Upcoming ShinDigs can only start with one cover photo.');
      return;
    }

    if (!selectedLocation && !locationQuery.trim()) {
      setError('Choose a starting location before continuing.');
      return;
    }

    if (plannedFor.getTime() <= Date.now()) {
      setError('Pick a future date and time for this planned ShinDig.');
      return;
    }

    setError('');

    if (!selectedLocation && locationQuery.trim()) {
      setIsSearchingLocations(true);
      try {
        const results = await searchPlaces({
          localityHint: locationHint || undefined,
          mode: 'submit',
          near: currentLocation
            ? {
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
              }
            : undefined,
          query: locationQuery.trim(),
        });

        if (results.length > 0) {
          setSelectedLocation(results[0]);
          setLocationQuery(results[0].title);
        } else {
          setSelectedLocation(buildManualPlace(locationQuery));
        }
      } catch (nextError) {
        setSelectedLocation(buildManualPlace(locationQuery));
        if (nextError instanceof Error) {
          setError(`${nextError.message} Continuing with your typed location instead.`);
        }
      } finally {
        setIsSearchingLocations(false);
      }
    }

    setInviteSearch('');
    setIsInvitePickerOpen(false);
    setContacts([]);
    setStep('invite');
  }

  async function openInvitePicker() {
    setError('');
    setInviteSearch('');
    setInviteSearchResults([]);
    setIsInvitePickerOpen(true);
    await loadDeviceContacts({ reset: true });
  }

  function closeInvitePicker() {
    contactsRequestIdRef.current += 1;
    setIsLoadingContacts(false);
    setInviteSearch('');
    setInviteSearchResults([]);
    setIsInvitePickerOpen(false);
  }

  function skipInvites() {
    contactsRequestIdRef.current += 1;
    setIsInvitePickerOpen(false);
    void saveShindigAndOpenFeed();
  }

  function mapInviteContact(contact: Contacts.ExistingContact) {
    const firstPhone = getContactPhoneValue(contact);
    const displayName = contactDisplayName(contact);
    if (!contact.id || !displayName || !firstPhone) {
      return null;
    }

    return {
      id: contact.id,
      name: displayName,
      phoneNumber: firstPhone,
    } satisfies InviteContact;
  }

  async function loadDeviceContacts(args?: { reset?: boolean }) {
    const requestId = contactsRequestIdRef.current + 1;
    contactsRequestIdRef.current = requestId;

    if (args?.reset) {
      setContacts([]);
    }

    setIsLoadingContacts(true);
    try {
      let permission = await Contacts.getPermissionsAsync();
      if (permission.status !== 'granted') {
        permission = await Contacts.requestPermissionsAsync();
      }

      if (requestId !== contactsRequestIdRef.current) {
        return;
      }

      if (permission.status !== 'granted') {
        setContacts([]);
        setError('Contacts access is required to invite people by text.');
        return;
      }

      const result = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
        sort: Contacts.SortTypes.FirstName,
      });

      if (requestId !== contactsRequestIdRef.current) {
        return;
      }

      const nextContacts = (result.data || [])
        .map(mapInviteContact)
        .filter((contact): contact is InviteContact => Boolean(contact));

      setContacts(Array.from(new Map(nextContacts.map((contact) => [contact.id, contact])).values()));
    } catch (nextError) {
      if (requestId === contactsRequestIdRef.current) {
        setError(nextError instanceof Error ? nextError.message : 'Could not load contacts.');
      }
    } finally {
      if (requestId === contactsRequestIdRef.current) {
        setIsLoadingContacts(false);
      }
    }
  }

  function toggleFriend(friendId: string) {
    setSelectedFriendIds((current) =>
      current.includes(friendId)
        ? current.filter((id) => id !== friendId)
        : [...current, friendId]
    );
  }

  function toggleAllVisibleFriends() {
    const visibleFriendIds = filteredFriends.map((friend) => friend.id);
    const allVisibleSelected =
      visibleFriendIds.length > 0 &&
      visibleFriendIds.every((friendId) => selectedFriendIds.includes(friendId));

    if (allVisibleSelected) {
      setSelectedFriendIds((current) =>
        current.filter((friendId) => !visibleFriendIds.includes(friendId))
      );
      return;
    }

    setSelectedFriendIds((current) =>
      Array.from(new Set([...current, ...visibleFriendIds]))
    );
  }

  function toggleContact(contact: InviteContact) {
    setSelectedContactsById((current) => {
      if (current[contact.id]) {
        const next = { ...current };
        delete next[contact.id];
        return next;
      }

      return {
        ...current,
        [contact.id]: contact,
      };
    });
  }

  function toggleInviteUser(profile: FriendProfile) {
    setSelectedInviteUsersById((current) => {
      if (current[profile.id]) {
        const next = { ...current };
        delete next[profile.id];
        return next;
      }

      return {
        ...current,
        [profile.id]: profile,
      };
    });
  }

  async function handleUpcomingInviteResponse(
    shindig: SavedShindig,
    nextStatus: 'accepted' | 'maybe' | 'rejected'
  ) {
    if (!shindig.inviteId) {
      return;
    }

    setActingUpcomingInviteId(shindig.inviteId);
    setError('');

    try {
      if (nextStatus === 'accepted') {
        await onAcceptUpcomingInvite?.(shindig.inviteId);
      } else if (nextStatus === 'maybe') {
        await onMaybeUpcomingInvite?.(shindig.inviteId);
      } else {
        await onRejectUpcomingInvite?.(shindig.inviteId);
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Could not update your upcoming ShinDig response.'
      );
    } finally {
      setActingUpcomingInviteId('');
    }
  }

  async function saveShindigAndOpenFeed() {
    const startingPlace = selectedLocation || (locationQuery.trim() ? buildManualPlace(locationQuery) : null);

    if (!startingPlace) {
      setError('Choose a starting location first.');
      return;
    }

    setIsSavingShindig(true);
    setError('');

    try {
      const savedShindig = await onShindigSaved({
        plannedFor: plannedFor.toISOString(),
        state: 'planned',
        stops: [
          {
            photos,
            place: startingPlace,
          },
        ],
        title: shindigName.trim(),
        userId,
      });
      const preferredCoverDraftIndex = photos.findIndex((photo) => photo.isPreferredCover);
      let savedShindigWithCover = savedShindig;

      if (preferredCoverDraftIndex >= 0) {
        const savedPhotosByOldest = [...savedShindig.stops.flatMap((stop) => stop.photos)].sort(
          (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
        );
        const preferredCoverPhoto = savedPhotosByOldest[preferredCoverDraftIndex];

        if (preferredCoverPhoto) {
          savedShindigWithCover = await onShindigCoverPhotoChanged({
            photoId: preferredCoverPhoto.id,
            shindigId: savedShindig.id,
          });
        }
      }

      const inviteIssues: string[] = [];
      const selectedAppInvitees = [
        ...selectedFriends,
        ...selectedInviteUsers.filter(
          (candidate) => !selectedFriendIds.includes(candidate.id)
        ),
      ];

      if (selectedAppInvitees.length > 0) {
        try {
          const invites = await createAppFriendShindigInvites({
            friendIds: selectedAppInvitees.map((friend) => friend.id),
            inviterUserId: userId,
            shindigId: savedShindigWithCover.id,
          });

          await Promise.all(
            invites
              .filter((invite) => invite.status === 'pending' && invite.invitee_user_id)
              .map((invite) =>
                createNotification({
                  actorUserId: userId,
                  inviteId: invite.id,
                  message:
                    shindigTiming === 'planned'
                      ? `${profile.name} invited you to the planned ShinDig "${savedShindigWithCover.title}" on ${formatPlannedDateLabel(
                          plannedFor.toISOString()
                        )}.`
                      : `${profile.name} added you to the ShinDig "${savedShindigWithCover.title}".`,
                  recipientUserId: invite.invitee_user_id!,
                  shindigId: savedShindigWithCover.id,
                  type: 'shindig_invite',
                })
              )
          );
        } catch (nextError) {
          inviteIssues.push(
            nextError instanceof Error
              ? nextError.message
              : 'Some in-app friend invites could not be sent.'
          );
        }
      }

      if (selectedContacts.length > 0) {
        try {
          const smsAvailable = await SMS.isAvailableAsync();
          if (!smsAvailable) {
            throw new Error('Text-message invites are only available on your phone.');
          }

          const invite = await createPhoneShindigInvite({
            inviterUserId: userId,
            shindigId: savedShindigWithCover.id,
          });
          if (!invite.invite_token) {
            throw new Error('The text-message invite link could not be created.');
          }
          const inviteUrl = `${INVITE_LINK_BASE}?invite=${encodeURIComponent(
            invite.invite_token
          )}`;

          await SMS.sendSMSAsync(
            selectedContacts.map((contact) => contact.phoneNumber),
            shindigTiming === 'planned'
              ? `${profile.name} invited you to the planned ShinDig "${savedShindigWithCover.title}" on ${formatPlannedDateLabel(
                  plannedFor.toISOString()
                )}. If you are new, sign up first. If you already have ShinDig, open this link to review the invite: ${inviteUrl}`
              : `${profile.name} invited you to join the ShinDig "${savedShindigWithCover.title}". If you are new, sign up first. If you already have ShinDig, open this link to review the invite: ${inviteUrl}`
          );
        } catch (nextError) {
          inviteIssues.push(
            nextError instanceof Error
              ? nextError.message
              : 'The text-message invites could not be sent.'
          );
        }
      }

      setActiveFeedShindig(savedShindigWithCover);
      setStep('feed');
      if (inviteIssues.length > 0) {
        setError(inviteIssues.join(' '));
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to start this ShinDig.'
      );
    } finally {
      setIsSavingShindig(false);
    }
  }

  async function handleToggleShindigLike() {
    if (!activeFeedShindig) {
      return;
    }

    const targetShindig = activeFeedShindig;
    const wasLiked = targetShindig.likedByMe;
    setActiveFeedShindig((current) =>
      current
        ? {
            ...current,
            likeCount: current.likeCount + (current.likedByMe ? -1 : 1),
            likedByMe: !current.likedByMe,
          }
        : current
    );

    await toggleShindigLike({
      shindigId: targetShindig.id,
      userId,
    });
    if (!wasLiked && targetShindig.ownerId !== userId) {
      await createNotification({
        actorUserId: userId,
        message: `${profile.name} liked your ShinDig "${targetShindig.title}".`,
        recipientUserId: targetShindig.ownerId,
        shindigId: targetShindig.id,
        type: 'shindig_like',
      });
    }
  }

  async function handleAddBringItem() {
    if (!activeFeedShindig || activeFeedShindig.ownerId !== userId) {
      return;
    }

    const targetShindig = activeFeedShindig;
    const nextLabel = bringItemDraft.trim();
    if (!nextLabel) {
      setError('Enter something people should bring.');
      return;
    }

    setActingBringItemId('new');
    setError('');

    try {
      await addBringItem({
        label: nextLabel,
        shindigId: targetShindig.id,
        userId,
      });
      const recipientIds = upcomingBringActivityRecipientIds(targetShindig, userId);

      if (recipientIds.length > 0) {
        await Promise.all(
          recipientIds.map((recipientUserId) =>
            createNotification({
              actorUserId: userId,
              message: `${profile.name} added "${nextLabel}" to the bring list for "${targetShindig.title}".`,
              recipientUserId,
              shindigId: targetShindig.id,
              type: 'shindig_bring_item',
            })
          )
        );
      }
      setBringItemDraft('');
      await refreshActiveFeed(targetShindig.id);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Could not add that bring-list item.'
      );
    } finally {
      setActingBringItemId('');
    }
  }

  async function handleAddCustomBringItem() {
    if (!activeFeedShindig || !canCurrentUserClaimBringItems) {
      return;
    }

    const nextLabel = customBringItemDraft.trim();
    if (!nextLabel) {
      setError('Type what you are bringing first.');
      return;
    }

    setActingBringItemId('custom-new');
    setError('');

    try {
      await addBringItem({
        claimForCreator: true,
        isCustom: true,
        label: nextLabel,
        shindigId: activeFeedShindig.id,
        userId,
      });
      const recipientIds = upcomingBringActivityRecipientIds(activeFeedShindig, userId);
      if (recipientIds.length > 0) {
        await Promise.all(
          recipientIds.map((recipientUserId) =>
            createNotification({
              actorUserId: userId,
              message: `${profile.name} added a custom bring-list item "${nextLabel}" for "${activeFeedShindig.title}".`,
              recipientUserId,
              shindigId: activeFeedShindig.id,
              type: 'shindig_bring_item',
            })
          )
        );
      }
      setCustomBringItemDraft('');
      await refreshActiveFeed(activeFeedShindig.id);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Could not add your custom bring-list item.'
      );
    } finally {
      setActingBringItemId('');
    }
  }

  async function handleClaimBringItem(item: ShindigBringItem) {
    if (!activeFeedShindig || !canCurrentUserClaimBringItems) {
      return;
    }

    const targetShindig = activeFeedShindig;
    setActingBringItemId(item.id);
    setError('');

    try {
      if (item.claimedBy?.id === userId) {
        await unclaimBringItem({
          itemId: item.id,
          shindigId: targetShindig.id,
          userId,
        });
        const recipientIds = upcomingBringActivityRecipientIds(targetShindig, userId);
        if (recipientIds.length > 0) {
          await Promise.all(
            recipientIds.map((recipientUserId) =>
              createNotification({
                actorUserId: userId,
                message: `${profile.name} removed themselves from bringing "${item.label}" for "${targetShindig.title}".`,
                recipientUserId,
                shindigId: targetShindig.id,
                type: 'shindig_bring_item',
              })
            )
          );
        }
      } else {
        await claimBringItem({
          itemId: item.id,
          shindigId: targetShindig.id,
          userId,
        });
        const recipientIds = upcomingBringActivityRecipientIds(targetShindig, userId);
        if (recipientIds.length > 0) {
          await Promise.all(
            recipientIds.map((recipientUserId) =>
              createNotification({
                actorUserId: userId,
                message: `${profile.name} chose to bring "${item.label}" for "${targetShindig.title}".`,
                recipientUserId,
                shindigId: targetShindig.id,
                type: 'shindig_bring_item',
              })
            )
          );
        }
      }

      await refreshActiveFeed(targetShindig.id);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Could not update that bring-list item.'
      );
    } finally {
      setActingBringItemId('');
    }
  }

  async function handleDeleteBringItem(itemId: string) {
    if (!activeFeedShindig || activeFeedShindig.ownerId !== userId) {
      return;
    }

    const targetShindig = activeFeedShindig;
    const targetItem = targetShindig.bringItems.find((item) => item.id === itemId) || null;
    setActingBringItemId(itemId);
    setError('');

    try {
      await deleteBringItem({
        itemId,
        shindigId: targetShindig.id,
        userId,
      });
      const recipientIds = upcomingBringActivityRecipientIds(targetShindig, userId);
      if (recipientIds.length > 0 && targetItem) {
        await Promise.all(
          recipientIds.map((recipientUserId) =>
            createNotification({
              actorUserId: userId,
              message: `${profile.name} removed "${targetItem.label}" from the bring list for "${targetShindig.title}".`,
              recipientUserId,
              shindigId: targetShindig.id,
              type: 'shindig_bring_item',
            })
          )
        );
      }
      await refreshActiveFeed(targetShindig.id);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Could not remove that bring-list item.'
      );
    } finally {
      setActingBringItemId('');
    }
  }

  async function handleAddShindigComment() {
    if (!activeFeedShindig || !shindigCommentDraft.trim()) {
      return;
    }

    const targetShindig = activeFeedShindig;
    const nextBody = shindigCommentDraft.trim();
    const optimisticComment = {
      author: buildCurrentUserProfile(profile, userId),
      body: nextBody,
      createdAt: new Date().toISOString(),
      id: `local-shindig-comment-${Date.now()}`,
    } satisfies SavedShindig['comments'][number];

    setActiveFeedShindig((current) =>
      current
        ? {
            ...current,
            comments: [optimisticComment, ...current.comments],
          }
        : current
    );
    setShindigCommentDraft('');

    await addShindigComment({
      body: nextBody,
      shindigId: targetShindig.id,
      userId,
    });
    if (targetShindig.ownerId !== userId) {
      await createNotification({
        actorUserId: userId,
        message: `${profile.name} commented on your ShinDig "${targetShindig.title}".`,
        recipientUserId: targetShindig.ownerId,
        shindigId: targetShindig.id,
        type: 'shindig_comment',
      });
    }
  }

  async function handleTogglePhotoLike(photoId: string) {
    if (!activeFeedShindig) {
      return;
    }

    const targetShindig = activeFeedShindig;
    const targetPhoto = targetShindig.stops.flatMap((stop) => stop.photos).find((photo) => photo.id === photoId);
    const wasLiked = targetPhoto?.likedByMe;
    const recipientUserId = getPhotoNotificationRecipient(targetShindig, photoId);
    setActiveFeedShindig((current) =>
      current
        ? {
            ...current,
            stops: current.stops.map((stop) => ({
              ...stop,
              photos: stop.photos.map((photo) =>
                photo.id === photoId
                  ? {
                      ...photo,
                      likeCount: photo.likeCount + (photo.likedByMe ? -1 : 1),
                      likedByMe: !photo.likedByMe,
                    }
                  : photo
              ),
            })),
          }
        : current
    );
    await togglePhotoLike({
      photoId,
      userId,
    });
    if (!wasLiked && recipientUserId !== userId) {
      await createNotification({
        actorUserId: userId,
        message: `${profile.name} liked a photo in your ShinDig "${targetShindig.title}".`,
        photoId,
        recipientUserId,
        shindigId: targetShindig.id,
        type: 'photo_like',
      });
    }
  }

  async function handleOpenPhotoLikeSheet(photo: SavedShindigPhoto) {
    setLikeSheetTitle('Liked by');
    setLikeSheetProfiles([]);
    setIsLikeSheetVisible(true);
    setIsLoadingLikeSheet(true);

    try {
      const nextProfiles = await listPhotoLikeProfiles(photo.id);
      setLikeSheetProfiles(nextProfiles);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to load the likes for this photo.'
      );
      setIsLikeSheetVisible(false);
    } finally {
      setIsLoadingLikeSheet(false);
    }
  }

  async function handleAddPhotoComment(photoId: string) {
    if (!activeFeedShindig) {
      return;
    }

    const nextBody = photoCommentDrafts[photoId]?.trim();
    if (!nextBody) {
      return;
    }

    const targetShindig = activeFeedShindig;
    const recipientUserId = getPhotoNotificationRecipient(targetShindig, photoId);
    const optimisticComment = {
      author: buildCurrentUserProfile(profile, userId),
      body: nextBody,
      createdAt: new Date().toISOString(),
      id: `local-photo-comment-${photoId}-${Date.now()}`,
    } satisfies SavedShindigPhoto['comments'][number];

    setActiveFeedShindig((current) =>
      current
        ? {
            ...current,
            stops: current.stops.map((stop) => ({
              ...stop,
              photos: stop.photos.map((photo) =>
                photo.id === photoId
                  ? {
                      ...photo,
                      comments: [optimisticComment, ...photo.comments],
                    }
                  : photo
              ),
            })),
          }
        : current
    );

    await addPhotoComment({
      body: nextBody,
      photoId,
      userId,
    });
    if (recipientUserId !== userId) {
      await createNotification({
        actorUserId: userId,
        message: `${profile.name} commented on a photo in your ShinDig "${targetShindig.title}".`,
        photoId,
        recipientUserId,
        shindigId: targetShindig.id,
        type: 'photo_comment',
      });
    }
    setPhotoCommentDrafts((current) => ({ ...current, [photoId]: '' }));
  }

  async function handleDeleteShindigComment(commentId: string) {
    if (!activeFeedShindig) {
      return;
    }

    await deleteShindigComment({
      commentId,
      userId,
    });
    setActiveFeedShindig((current) =>
      current
        ? {
            ...current,
            comments: current.comments.filter((comment) => comment.id !== commentId),
          }
        : current
    );
  }

  async function handleDeletePhotoComment(commentId: string) {
    if (!activeFeedShindig) {
      return;
    }

    await deletePhotoComment({
      commentId,
      userId,
    });
    setActiveFeedShindig((current) =>
      current
        ? {
            ...current,
            stops: current.stops.map((stop) => ({
              ...stop,
              photos: stop.photos.map((photo) => ({
                ...photo,
                comments: photo.comments.filter((comment) => comment.id !== commentId),
              })),
            })),
          }
        : current
    );
  }

  async function handleSelectCoverPhoto(photoId: string) {
    if (!activeFeedShindig) {
      return;
    }

    const updated = await onShindigCoverPhotoChanged({
      photoId,
      shindigId: activeFeedShindig.id,
    });
    setActiveFeedShindig(updated);
    setShowCoverPhotoSavedNotice(true);
    if (coverPhotoSavedNoticeTimeoutRef.current) {
      clearTimeout(coverPhotoSavedNoticeTimeoutRef.current);
    }
    coverPhotoSavedNoticeTimeoutRef.current = setTimeout(() => {
      setShowCoverPhotoSavedNotice(false);
      coverPhotoSavedNoticeTimeoutRef.current = null;
    }, 3000);
  }

  async function handleDeleteActiveShindig() {
    if (!activeFeedShindig) {
      return;
    }

    try {
      const shindigId = activeFeedShindig.id;
      await onShindigDeleted(shindigId);
      setActiveFeedShindig(null);
      setShowOwnerPhotoPrompt(false);
      setHighlightedPhotoId('');
      setStep('welcome');
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to delete this ShinDig.'
      );
    }
  }

  function openDeleteShindigPrompt() {
    const confirmDelete = () => {
      void handleDeleteActiveShindig();
    };

    Alert.alert('Delete ShinDig', 'This will permanently delete this ShinDig and its photos.', [
      {
        style: 'cancel',
        text: 'Cancel',
      },
      {
        onPress: confirmDelete,
        style: 'destructive',
        text: 'Delete',
      },
    ]);
  }

  function handleInviteMorePeopleFromMenu() {
    void handleShareUpcomingShindig();
  }

  function openShindigOwnerMenu() {
    if (!activeFeedShindig) {
      return;
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          cancelButtonIndex: 2,
          destructiveButtonIndex: 1,
          options: ['Invite More People', 'Delete ShinDig', 'Cancel'],
          title: activeFeedShindig.title,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            handleInviteMorePeopleFromMenu();
          }
          if (buttonIndex === 1) {
            openDeleteShindigPrompt();
          }
        }
      );
      return;
    }

    Alert.alert(activeFeedShindig.title, 'Manage this ShinDig.', [
      {
        onPress: handleInviteMorePeopleFromMenu,
        text: 'Invite More People',
      },
      {
        onPress: openDeleteShindigPrompt,
        style: 'destructive',
        text: 'Delete ShinDig',
      },
      {
        style: 'cancel',
        text: 'Cancel',
      },
    ]);
  }

  function openPhotoOwnerMenu(photo: SavedShindigPhoto) {
    const isCurrentCover = activeFeedShindig?.coverPhotoPhotoId === photo.id;
    const canSelectCover = Boolean(
      activeFeedShindig &&
        (activeFeedShindig.ownerId === userId ||
          (activeFeedShindig.state !== 'planned' &&
            activeFeedShindig.inviteStatus === 'accepted'))
    );
    const canDeletePhoto =
      photo.contributor?.id === userId ||
      (!photo.contributor && activeFeedShindig?.ownerId === userId);
    const sharePhoto = () => {
      void handleSharePhoto(photo);
    };
    const savePhoto = () => {
      void handleSavePhotoToDevice(photo);
    };
    const selectCover = () => {
      if (canSelectCover && !isCurrentCover) {
        void handleSelectCoverPhoto(photo.id);
      }
    };
    const deletePhoto = () => {
      void handleDeletePhotoFromFeed(photo);
    };

    if (Platform.OS === 'ios') {
      const options = [
        'Share to Apps',
        'Download to Device',
        ...(canSelectCover
          ? [isCurrentCover ? 'Current Cover Photo' : 'Select as Cover Photo']
          : []),
        ...(canDeletePhoto ? ['Delete Photo'] : []),
        'Cancel',
      ];
      const cancelButtonIndex = options.length - 1;
      const destructiveButtonIndex = canDeletePhoto ? options.indexOf('Delete Photo') : undefined;

      ActionSheetIOS.showActionSheetWithOptions(
        {
          cancelButtonIndex,
          destructiveButtonIndex,
          options,
          title: 'Photo Options',
        },
        (buttonIndex) => {
          if (buttonIndex === options.indexOf('Share to Apps')) {
            sharePhoto();
          }
          if (buttonIndex === options.indexOf('Download to Device')) {
            savePhoto();
          }
          if (
            canSelectCover &&
            buttonIndex === options.indexOf(isCurrentCover ? 'Current Cover Photo' : 'Select as Cover Photo') &&
            !isCurrentCover
          ) {
            selectCover();
          }
          if (canDeletePhoto && buttonIndex === options.indexOf('Delete Photo')) {
            deletePhoto();
          }
        }
      );
      return;
    }

    if (canSelectCover && isCurrentCover && !canDeletePhoto) {
      Alert.alert('Cover Photo', 'This photo is already the cover photo.');
      return;
    }

    const options = [];

    options.push({
      onPress: sharePhoto,
      text: 'Share to Apps',
    });

    options.push({
      onPress: savePhoto,
      text: 'Download to Device',
    });

    if (canSelectCover) {
      options.push({
        onPress: selectCover,
        text: isCurrentCover ? 'Current Cover Photo' : 'Select as Cover Photo',
      });
    }

    if (canDeletePhoto) {
      options.push({
        onPress: deletePhoto,
        style: 'destructive' as const,
        text: 'Delete Photo',
      });
    }

    options.push({
      style: 'cancel' as const,
      text: 'Cancel',
    });

    Alert.alert(
      'Photo Options',
      'Share this photo to installed apps like Instagram, Snapchat, or TikTok, or download it to your device.',
      options
    );
  }

  async function downloadPhotoToLocalUri(photo: SavedShindigPhoto) {
    const extension = fileExtensionFromUri(photo.photoUrl);
    const baseDirectory = FileSystem.cacheDirectory || FileSystem.documentDirectory;

    if (!baseDirectory) {
      throw new Error('Temporary storage is not available on this device.');
    }

    const targetUri = `${baseDirectory}shindig-share-${photo.id}.${extension}`;
    const result = await FileSystem.downloadAsync(photo.photoUrl, targetUri);
    return {
      mimeType: mimeTypeFromExtension(extension),
      uri: result.uri,
    };
  }

  async function handleSavePhotoToDevice(photo: SavedShindigPhoto) {
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        setError('Photo library access is required to save photos to your device.');
        return;
      }

      const { uri } = await downloadPhotoToLocalUri(photo);
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Saved', 'Photo saved to your device.');
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to save this photo.'
      );
    }
  }

  async function handleSharePhoto(photo: SavedShindigPhoto) {
    try {
      if (Platform.OS === 'web') {
        await Share.share({
          message: photo.photoUrl,
          url: photo.photoUrl,
        });
        return;
      }

      const { mimeType, uri } = await downloadPhotoToLocalUri(photo);
      const canShareFile = await Sharing.isAvailableAsync();

      if (canShareFile) {
        await Sharing.shareAsync(uri, {
          dialogTitle: 'Share photo',
          mimeType,
          UTI: 'public.image',
        });
        return;
      }

      await Linking.openURL(photo.photoUrl);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to share this photo.'
      );
    }
  }

  async function handleDeletePhotoFromFeed(photo: SavedShindigPhoto) {
    if (!activeFeedShindig) {
      return;
    }

    try {
      const updated = await onShindigPhotoDeleted({
        photoId: photo.id,
        shindigId: activeFeedShindig.id,
      });

      if (!updated) {
        setActiveFeedShindig(null);
        setShowOwnerPhotoPrompt(false);
        setShowPhotoRequestPrompt(false);
        setHighlightedPhotoId('');
        setStep('welcome');
        return;
      }

      setActiveFeedShindig(updated);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to delete this photo.'
      );
    }
  }

  function scrollToUpcomingSection(key: 'activity' | 'bring' | 'memories') {
    const y = sectionOffsetsRef.current[key];
    if (typeof y !== 'number') {
      return;
    }

    feedScrollRef.current?.scrollTo({
      animated: true,
      y: Math.max(y - 120, 0),
    });
  }

  async function handleShareUpcomingShindig() {
    if (!activeFeedShindig) {
      return;
    }

    try {
      const detail = activeFeedShindig.plannedFor
        ? ` on ${formatPlannedDateLabel(activeFeedShindig.plannedFor)}`
        : '';

      if (activeFeedShindig.ownerId === userId) {
        const invite = await createPhoneShindigInvite({
          inviterUserId: userId,
          shindigId: activeFeedShindig.id,
        });
        const inviteUrl = `${INVITE_LINK_BASE}?invite=${encodeURIComponent(invite.invite_token || '')}`;
        await Share.share({
          message: `${profile.name} invited you to "${activeFeedShindig.title}"${detail}. Open this invite: ${inviteUrl}`,
          title: activeFeedShindig.title,
        });
        return;
      }

      await Share.share({
        message: `${activeFeedShindig.title}${detail}`,
        title: activeFeedShindig.title,
      });
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to share this upcoming ShinDig.'
      );
    }
  }

  async function handleUpcomingPrimaryPhotoAction() {
    if (!activeFeedShindig) {
      return;
    }

    if (activeFeedShindig.state === 'planned') {
      setShowOwnerPhotoPrompt(activeFeedShindig.ownerId === userId);
      setShowPhotoRequestPrompt(activeFeedShindig.ownerId !== userId);
      setPlannedFeedViewMode('feed');
      return;
    }

    if (activeFeedShindig.ownerId === userId) {
      handleAddPhotoToOwnedShindig();
      return;
    }

    await handleAddPhotoToSharedShindig();
  }

  async function handleUpcomingRsvpButton() {
    if (!activeFeedShindig?.inviteId || activeFeedShindig.ownerId === userId) {
      return;
    }

    const nextStatus =
      activeFeedShindig.inviteStatus === 'accepted' ? 'maybe' : 'accepted';
    await handleUpcomingInviteResponse(activeFeedShindig, nextStatus);
  }

  async function handleAddPhotoToSharedShindig() {
    if (
      !activeFeedShindig ||
      activeFeedShindig.ownerId === userId ||
      activeFeedShindig.state === 'completed'
    ) {
      return;
    }

    setShowOwnerPhotoPrompt(false);
    setShowPhotoRequestPrompt((current) => !current);
  }

  function handleAddPhotoToOwnedShindig() {
    if (
      !activeFeedShindig ||
      activeFeedShindig.ownerId !== userId ||
      activeFeedShindig.state === 'completed'
    ) {
      return;
    }

    setShowPhotoRequestPrompt(false);
    setShowOwnerPhotoPrompt((current) => !current);
  }

  async function addPhotoToOwnedShindig(source: 'camera' | 'library') {
    if (
      !activeFeedShindig ||
      activeFeedShindig.ownerId !== userId ||
      activeFeedShindig.state === 'completed'
    ) {
      return;
    }

    setError('');
    const photo = await pickSinglePhoto(source, {
      cameraPermission: 'Camera access is required to add a new photo to this ShinDig.',
      libraryPermission: 'Photo library access is required to add a new photo to this ShinDig.',
    });

    if (!photo) {
      return;
    }

    setIsAddingPhotoToShindig(true);
    try {
      await addPhotoToShindig({
        photo,
        shindigId: activeFeedShindig.id,
        userId,
      });
      setShowOwnerPhotoPrompt(false);
      await refreshActiveFeed(activeFeedShindig.id);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to add the photo.'
      );
    } finally {
      setIsAddingPhotoToShindig(false);
    }
  }

  async function addPhotoToSharedShindig(source: 'camera' | 'library') {
    if (
      !activeFeedShindig ||
      activeFeedShindig.ownerId === userId ||
      activeFeedShindig.state === 'completed'
    ) {
      return;
    }

    setError('');
    const photo = await pickSinglePhoto(source, {
      cameraPermission: 'Camera access is required to add a photo to this ShinDig.',
      libraryPermission: 'Photo library access is required to add a photo to this ShinDig.',
    });

    if (!photo) {
      return;
    }

    setIsAddingPhotoToShindig(true);
    try {
      const savedPhoto = await addPhotoToShindig({
        photo,
        shindigId: activeFeedShindig.id,
        userId,
      });
      await createNotification({
        actorUserId: userId,
        message: `${profile.name} added a photo to your ShinDig "${activeFeedShindig.title}".`,
        photoId: savedPhoto.id,
        recipientUserId: activeFeedShindig.ownerId,
        shindigId: activeFeedShindig.id,
        type: 'photo_add_request',
      });
      setShowPhotoRequestPrompt(false);
      await refreshActiveFeed(activeFeedShindig.id);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to add the photo.'
      );
    } finally {
      setIsAddingPhotoToShindig(false);
    }
  }

  async function handleUpdateShindigState(nextState: ShindigState) {
    if (!activeFeedShindig || activeFeedShindig.ownerId !== userId) {
      return;
    }

    setError('');

    try {
      const updatedShindig = await onShindigStateChanged({
        shindigId: activeFeedShindig.id,
        state: nextState,
      });
      setActiveFeedShindig(updatedShindig);
      if (nextState === 'completed') {
        setShowOwnerPhotoPrompt(false);
        setShowPhotoRequestPrompt(false);
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to update this ShinDig.'
      );
    }
  }

  function handleBackFromFeedScreen() {
    if (activeFeedShindig?.state === 'planned' && plannedFeedViewMode === 'feed') {
      setPlannedFeedViewMode('overview');
      return;
    }

    if (feedBackMode === 'external' && onBackFromFeed) {
      onBackFromFeed();
      return;
    }

    setStep('welcome');
  }

  if (step === 'welcome') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <PageHeader right={headerActions} title="ShinDigs" />

          <Pressable onPress={goToCreate} style={styles.ctaButton}>
            <Text style={styles.ctaButtonText}>Start a Shindig</Text>
          </Pressable>

          {plannedShindigs.length === 0 && activeShindigs.length === 0 && completedShindigs.length === 0 ? (
            <Text style={styles.emptyText}>
              Start your first ShinDig to build a shared photo feed and archive it here.
            </Text>
          ) : (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Upcoming Shindigs</Text>
              </View>

              {plannedShindigs.length > 0 ? (
                <View style={styles.pastList}>
                  {plannedShindigs.map((shindig) => (
                    <Pressable
                      key={shindig.id}
                      onPress={() => openPastShindig(shindig)}
                      style={styles.pastCard}
                    >
                      <Image
                        source={{
                          uri:
                            shindig.coverPhotoThumbnailUrl ||
                            shindig.coverPhotoUrl ||
                            'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1200&q=80',
                        }}
                        style={styles.pastCardImage}
                      />
                      <View style={styles.pastCardCopy}>
                        <Text style={styles.pastCardTitle}>{shindig.title}</Text>
                        <Text style={styles.pastCardMeta}>
                          {shindig.plannedFor
                            ? `Upcoming ${formatPlannedDateLabel(shindig.plannedFor)}`
                            : formatDateLabel(shindig.createdAt)}
                        </Text>
                        {shindig.invitedBy ? (
                          <Text style={styles.invitedByTag}>via {shindig.invitedBy.handle}</Text>
                        ) : null}
                        {shindig.invitedBy && shindig.inviteId ? (
                          <View style={styles.upcomingInviteActions}>
                            <Pressable
                              disabled={actingUpcomingInviteId === shindig.inviteId}
                              onPress={() => void handleUpcomingInviteResponse(shindig, 'accepted')}
                              style={[
                                styles.upcomingInviteButton,
                                shindig.inviteStatus === 'accepted' && styles.upcomingInviteButtonActive,
                              ]}
                            >
                              <Text style={styles.upcomingInviteButtonText}>
                                {actingUpcomingInviteId === shindig.inviteId ? '...' : 'Accept'}
                              </Text>
                            </Pressable>
                            <Pressable
                              disabled={actingUpcomingInviteId === shindig.inviteId}
                              onPress={() => void handleUpcomingInviteResponse(shindig, 'maybe')}
                              style={[
                                styles.upcomingInviteButtonSecondary,
                                shindig.inviteStatus === 'maybe' && styles.upcomingInviteButtonActive,
                              ]}
                            >
                              <Text style={styles.upcomingInviteButtonText}>Maybe</Text>
                            </Pressable>
                            <Pressable
                              disabled={actingUpcomingInviteId === shindig.inviteId}
                              onPress={() => void handleUpcomingInviteResponse(shindig, 'rejected')}
                              style={[
                                styles.upcomingInviteButtonSecondary,
                                shindig.inviteStatus === 'rejected' && styles.upcomingInviteRejectActive,
                              ]}
                            >
                              <Text style={styles.upcomingInviteButtonText}>Reject</Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>No upcoming ShinDigs right now.</Text>
              )}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Active Shindigs</Text>
              </View>

              {activeShindigs.length > 0 ? (
                <View style={styles.pastList}>
                  {activeShindigs.map((shindig) => (
                    <Pressable
                      key={shindig.id}
                      onPress={() => openPastShindig(shindig)}
                      style={styles.pastCard}
                    >
                      <Image
                        source={{
                          uri:
                            shindig.coverPhotoThumbnailUrl ||
                            shindig.coverPhotoUrl ||
                            'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1200&q=80',
                        }}
                        style={styles.pastCardImage}
                      />
                      <View style={styles.pastCardCopy}>
                        <Text style={styles.pastCardTitle}>{shindig.title}</Text>
                        <Text style={styles.pastCardMeta}>{formatDateLabel(shindig.createdAt)}</Text>
                        {shindig.invitedBy ? (
                          <Text style={styles.invitedByTag}>via {shindig.invitedBy.handle}</Text>
                        ) : null}
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>No active ShinDigs right now.</Text>
              )}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Completed Shindigs</Text>
              </View>

              {completedShindigs.length > 0 ? (
                <View style={styles.pastList}>
                  {completedShindigs.map((shindig) => (
                    <Pressable
                      key={shindig.id}
                      onPress={() => openPastShindig(shindig)}
                      style={styles.pastCard}
                    >
                      <Image
                        source={{
                          uri:
                            shindig.coverPhotoThumbnailUrl ||
                            shindig.coverPhotoUrl ||
                            'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1200&q=80',
                        }}
                        style={styles.pastCardImage}
                      />
                      <View style={styles.pastCardCopy}>
                        <Text style={styles.pastCardTitle}>{shindig.title}</Text>
                        <Text style={styles.pastCardMeta}>{formatDateLabel(shindig.createdAt)}</Text>
                        {shindig.invitedBy ? (
                          <Text style={styles.invitedByTag}>via {shindig.invitedBy.handle}</Text>
                        ) : null}
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>No completed ShinDigs yet.</Text>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'feed' && activeFeedShindig) {
    const feedPhotos = sortPhotosNewestFirst(
      activeFeedShindig.stops.flatMap((stop) => stop.photos)
    );
    const coverPhotoUri =
      activeFeedShindig.coverPhotoUrl ||
      activeFeedShindig.coverPhotoThumbnailUrl ||
      feedPhotos[0]?.photoUrl ||
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1400&q=80';
    const claimedByMeCount = activeFeedShindig.bringItems.filter(
      (item) => item.claimedBy?.id === userId
    ).length;

    if (activeFeedShindig.state === 'planned' && plannedFeedViewMode === 'overview') {
      return (
        <SafeAreaView style={styles.safeArea}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.flex}
          >
            <Modal
              animationType="fade"
              onRequestClose={() => setExpandedPhoto(null)}
              transparent
              visible={Boolean(expandedPhoto)}
            >
              <View style={styles.photoViewerBackdrop}>
                <Pressable
                  onPress={() => setExpandedPhoto(null)}
                  style={styles.photoViewerDismissArea}
                />
                <View style={styles.photoViewerCard}>
                  <Pressable
                    onPress={() => setExpandedPhoto(null)}
                    style={styles.photoViewerCloseButton}
                  >
                    <Ionicons color="#FFFFFF" name="close" size={22} />
                  </Pressable>
                  {expandedPhoto ? (
                    <ProgressiveImage
                      containerStyle={styles.photoViewerFrame}
                      imageStyle={styles.photoViewerImage}
                      resizeMode="contain"
                      sourceUri={expandedPhoto.photoUrl}
                    />
                  ) : null}
                </View>
              </View>
            </Modal>
            <ScrollView
              contentContainerStyle={styles.upcomingScreenContent}
              keyboardShouldPersistTaps="handled"
              ref={feedScrollRef}
              showsVerticalScrollIndicator={false}
            >
              <PageHeader
                onBack={handleBackFromFeedScreen}
                right={headerActions}
                title="Upcoming ShinDig"
              />

              <View style={styles.upcomingHeroCard}>
                <Image source={{ uri: coverPhotoUri }} style={styles.upcomingHeroImage} />
                <View style={styles.upcomingHeroOverlay} />
                <View style={styles.upcomingHeroContent}>
                  <View style={styles.upcomingBadge}>
                    <Text style={styles.upcomingBadgeText}>UPCOMING</Text>
                  </View>
                  <Text style={styles.upcomingHeroTitle}>{activeFeedShindig.title}</Text>
                  <View style={styles.upcomingHeroMetaRow}>
                    <Text style={styles.upcomingHeroMetaText}>
                      {activeFeedShindig.plannedFor
                        ? formatPlannedDateLabel(activeFeedShindig.plannedFor)
                        : 'Date coming soon'}
                    </Text>
                    <Text style={styles.upcomingHeroMetaDot}>•</Text>
                    <Text style={styles.upcomingHeroMetaText}>{activeFeedCreatorLabel}</Text>
                  </View>
                  <View style={styles.upcomingHeroStatsRow}>
                    <View style={styles.upcomingHeroStat}>
                      <Ionicons color={theme.colors.accentPink} name="people" size={14} />
                      <Text style={styles.upcomingHeroStatText}>
                        {upcomingAttendeeGroups.accepted.length} Going
                      </Text>
                    </View>
                    <View style={styles.upcomingHeroStat}>
                      <Ionicons color={theme.colors.textPrimary} name="chatbubble-outline" size={14} />
                      <Text style={styles.upcomingHeroStatText}>
                        {activeFeedShindig.comments.length} Comments
                      </Text>
                    </View>
                    <View style={styles.upcomingHeroStat}>
                      <Ionicons color={theme.colors.textPrimary} name="images-outline" size={14} />
                      <Text style={styles.upcomingHeroStatText}>
                        {feedPhotos.length} Photos
                      </Text>
                    </View>
                  </View>
                  <View style={styles.upcomingHeroActionRow}>
                    <Pressable
                      onPress={() => void handleShareUpcomingShindig()}
                      style={styles.upcomingPillButtonSecondary}
                    >
                      <Ionicons color={theme.colors.textPrimary} name="share-outline" size={15} />
                      <Text style={styles.upcomingPillButtonSecondaryText}>Share</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void handleUpcomingPrimaryPhotoAction()}
                      style={styles.upcomingPillButtonSecondary}
                    >
                      <Ionicons color={theme.colors.textPrimary} name="camera-outline" size={15} />
                      <Text style={styles.upcomingPillButtonSecondaryText}>Add Photo</Text>
                    </Pressable>
                    {activeFeedShindig.ownerId === userId ? (
                      <Pressable
                        onPress={openShindigOwnerMenu}
                        style={styles.upcomingPillButtonSecondary}
                      >
                        <Ionicons
                          color={theme.colors.textPrimary}
                          name="ellipsis-horizontal"
                          size={15}
                        />
                        <Text style={styles.upcomingPillButtonSecondaryText}>More</Text>
                      </Pressable>
                    ) : null}
                    {activeFeedShindig.ownerId !== userId && activeFeedShindig.inviteId ? (
                      <Pressable
                        disabled={actingUpcomingInviteId === activeFeedShindig.inviteId}
                        onPress={() => void handleUpcomingRsvpButton()}
                        style={styles.upcomingPillButtonPrimary}
                      >
                        <Text style={styles.upcomingPillButtonPrimaryText}>
                          {actingUpcomingInviteId === activeFeedShindig.inviteId
                            ? 'Saving...'
                            : activeFeedShindig.inviteStatus === 'accepted'
                              ? 'Going'
                              : activeFeedShindig.inviteStatus === 'maybe'
                                ? 'Maybe'
                                : 'RSVP'}
                        </Text>
                        <Ionicons color="#FFFFFF" name="chevron-down" size={14} />
                      </Pressable>
                    ) : (
                      <View style={styles.upcomingHostPill}>
                        <Text style={styles.upcomingHostPillText}>
                          {activeFeedShindig.ownerId === userId ? 'Hosting' : 'Invited'}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              <View style={styles.upcomingQuickActionsRow}>
                <Pressable
                  onPress={() => scrollToUpcomingSection('bring')}
                  style={styles.upcomingQuickAction}
                >
                  <View style={[styles.upcomingQuickActionIconWrap, styles.upcomingQuickActionPink]}>
                    <Ionicons color="#FFFFFF" name="gift-outline" size={18} />
                  </View>
                  <Text style={styles.upcomingQuickActionText}>Bring{'\n'}Something</Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleUpcomingPrimaryPhotoAction()}
                  style={styles.upcomingQuickAction}
                >
                  <View
                    style={[styles.upcomingQuickActionIconWrap, styles.upcomingQuickActionPurple]}
                  >
                    <Ionicons color="#FFFFFF" name="camera-outline" size={18} />
                  </View>
                  <Text style={styles.upcomingQuickActionText}>Upload{'\n'}Photo</Text>
                </Pressable>
              </View>

              <View style={styles.upcomingDashboardGrid}>
                <View
                  onLayout={(event) => {
                    sectionOffsetsRef.current.bring = event.nativeEvent.layout.y;
                  }}
                  style={[styles.upcomingPanelCard, styles.upcomingPanelWide]}
                >
                  <View style={styles.upcomingPanelHeader}>
                    <View style={styles.upcomingPanelHeaderLeft}>
                      <Ionicons color={theme.colors.accentPink} name="calendar-outline" size={16} />
                      <Text style={styles.upcomingPanelTitle}>Things to Bring</Text>
                    </View>
                    <Text style={styles.upcomingPanelActionText}>Help make this shindig amazing</Text>
                  </View>

                  {activeFeedShindig.ownerId === userId ? (
                    <View style={styles.bringListComposer}>
                      <TextInput
                        onChangeText={setBringItemDraft}
                        onSubmitEditing={() => void handleAddBringItem()}
                        placeholder="Add an item to bring"
                        placeholderTextColor={theme.colors.textMuted}
                        returnKeyType="done"
                        style={styles.bringListInput}
                        value={bringItemDraft}
                      />
                      <Pressable
                        disabled={actingBringItemId === 'new'}
                        onPress={() => void handleAddBringItem()}
                        style={styles.bringListAddButton}
                      >
                        <Text style={styles.bringListAddButtonText}>
                          {actingBringItemId === 'new' ? 'Adding...' : 'Add'}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}

                  <View style={styles.bringListItemsCompact}>
                    {displayedStandardBringItems.map((item) => {
                      const isClaimedByMe = item.claimedBy?.id === userId;
                      const isClaimedByOther =
                        Boolean(item.claimedBy?.id) && item.claimedBy?.id !== userId;
                      const claimedAvatars = activeFeedShindig.bringItems
                        .filter((candidate) => candidate.label === item.label && candidate.claimedBy)
                        .map((candidate) => candidate.claimedBy!)
                        .slice(0, 3);

                      return (
                        <View key={item.id} style={styles.bringListItemCard}>
                          <View style={styles.bringListItemTopRow}>
                            <View style={styles.bringListItemLead}>
                              <Text style={styles.bringListEmoji}>
                                {item.label.toLowerCase().includes('beer')
                                  ? '🍺'
                                  : item.label.toLowerCase().includes('bread')
                                    ? '🍞'
                                    : item.label.toLowerCase().includes('pasta')
                                      ? '🍝'
                                      : item.label.toLowerCase().includes('weed')
                                        ? '🌿'
                                        : '🎉'}
                              </Text>
                              <View style={styles.bringListItemCopy}>
                                <Text style={styles.bringListItemLabel}>{item.label}</Text>
                                <Text style={styles.bringListItemMeta}>
                                  {item.claimedBy
                                    ? isClaimedByMe
                                      ? '1 of 1 claimed • You'
                                      : `1 of 1 claimed • ${item.claimedBy.name}`
                                    : '0 of 1 claimed'}
                                </Text>
                              </View>
                            </View>
                            {activeFeedShindig.ownerId === userId ? (
                              <Pressable
                                disabled={actingBringItemId === item.id}
                                onPress={() => void handleDeleteBringItem(item.id)}
                                style={styles.bringListDeleteButton}
                              >
                                <Ionicons color="#FF8A80" name="trash-outline" size={18} />
                              </Pressable>
                            ) : canCurrentUserClaimBringItems ? (
                              <Pressable
                                disabled={actingBringItemId === item.id || isClaimedByOther}
                                onPress={() => void handleClaimBringItem(item)}
                                style={[
                                  styles.bringListClaimButton,
                                  !isClaimedByMe &&
                                    !isClaimedByOther &&
                                    styles.bringListClaimButtonPrimary,
                                  isClaimedByOther && styles.bringListClaimButtonDisabled,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.bringListClaimButtonText,
                                    !isClaimedByMe &&
                                      !isClaimedByOther &&
                                      styles.bringListClaimButtonTextPrimary,
                                    isClaimedByOther && styles.bringListClaimButtonTextDisabled,
                                  ]}
                                >
                                  {actingBringItemId === item.id
                                    ? 'Saving...'
                                    : isClaimedByMe
                                      ? 'Undo'
                                      : isClaimedByOther
                                        ? 'Taken'
                                        : "I'm bringing it"}
                                </Text>
                              </Pressable>
                            ) : null}
                          </View>
                          <View style={styles.upcomingMiniAvatarRow}>
                            {claimedAvatars.map((avatar) => (
                              <Image
                                key={`${item.id}-${avatar.id}`}
                                source={{ uri: avatar.avatar }}
                                style={styles.upcomingMiniAvatar}
                              />
                            ))}
                            {claimedAvatars.length === 0 ? (
                              <Text style={styles.upcomingEmptyMiniText}>Nobody yet</Text>
                            ) : null}
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  {canCurrentUserClaimBringItems || customBringItems.length > 0 ? (
                    <View style={styles.customBringSection}>
                      <Text style={styles.customBringTitle}>Other</Text>
                      {canCurrentUserClaimBringItems ? (
                        <View style={styles.bringListComposer}>
                          <TextInput
                            onChangeText={setCustomBringItemDraft}
                            onSubmitEditing={() => void handleAddCustomBringItem()}
                            placeholder="Type a custom item"
                            placeholderTextColor={theme.colors.textMuted}
                            returnKeyType="done"
                            style={styles.bringListInput}
                            value={customBringItemDraft}
                          />
                          <Pressable
                            disabled={actingBringItemId === 'custom-new'}
                            onPress={() => void handleAddCustomBringItem()}
                            style={styles.bringListAddButton}
                          >
                            <Text style={styles.bringListAddButtonText}>
                              {actingBringItemId === 'custom-new' ? 'Adding...' : 'Add'}
                            </Text>
                          </Pressable>
                        </View>
                      ) : null}
                      {displayedCustomBringItems.length > 0 ? (
                        <View style={styles.bringListItems}>
                          {displayedCustomBringItems.map((item) => {
                            const isClaimedByMe = item.claimedBy?.id === userId;
                            const canRemoveCustomItem =
                              activeFeedShindig.ownerId === userId || isClaimedByMe;

                            return (
                              <View key={item.id} style={styles.bringListItemRow}>
                                <View style={styles.bringListItemCopy}>
                                  <Text style={styles.bringListItemLabel}>{item.label}</Text>
                                  <Text style={styles.bringListItemMeta}>
                                    {item.claimedBy
                                      ? `${item.claimedBy.name} added this custom item`
                                      : 'Custom item'}
                                  </Text>
                                </View>
                                {canRemoveCustomItem ? (
                                  <Pressable
                                    disabled={actingBringItemId === item.id}
                                    onPress={() => void handleDeleteBringItem(item.id)}
                                    style={styles.bringListClaimButton}
                                  >
                                    <Text style={styles.bringListClaimButtonText}>Remove</Text>
                                  </Pressable>
                                ) : null}
                              </View>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  {standardBringItems.length > 4 || customBringItems.length > 2 ? (
                    <Pressable
                      onPress={() => setShowAllUpcomingBringItems((current) => !current)}
                      style={styles.upcomingPanelFooter}
                    >
                      <Text style={styles.upcomingPanelFooterText}>
                        {showAllUpcomingBringItems ? 'Show fewer items' : 'See all items'}
                      </Text>
                      <Ionicons
                        color={theme.colors.textMuted}
                        name={showAllUpcomingBringItems ? 'chevron-up' : 'chevron-down'}
                        size={14}
                      />
                    </Pressable>
                  ) : null}
                </View>

                <View style={styles.upcomingDashboardSide}>
                  <View style={styles.upcomingPanelCard}>
                    <View style={styles.upcomingPanelHeader}>
                      <View style={styles.upcomingPanelHeaderLeft}>
                        <Ionicons color={theme.colors.accentPink} name="people" size={16} />
                        <Text style={styles.upcomingPanelTitle}>Attendees</Text>
                      </View>
                      <Text style={styles.upcomingPanelActionLink}>See all</Text>
                    </View>
                    <View style={styles.upcomingAttendeeGroup}>
                      <Text style={styles.upcomingAttendeeGroupLabel}>
                        Going ({upcomingAttendeeGroups.accepted.length})
                      </Text>
                      <View style={styles.upcomingAttendeeAvatarRow}>
                        {upcomingAttendeeGroups.accepted.slice(0, 7).map((person) => (
                          <Image
                            key={`accepted-${person.id}`}
                            source={{ uri: person.avatar }}
                            style={styles.upcomingAttendeeAvatar}
                          />
                        ))}
                        {upcomingAttendeeGroups.accepted.length > 7 ? (
                          <View style={styles.upcomingAttendeeOverflow}>
                            <Text style={styles.upcomingAttendeeOverflowText}>
                              +{upcomingAttendeeGroups.accepted.length - 7}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.upcomingAttendeeGroup}>
                      <Text style={styles.upcomingAttendeeGroupLabel}>
                        Maybe ({upcomingAttendeeGroups.maybe.length})
                      </Text>
                      <View style={styles.upcomingAttendeeAvatarRow}>
                        {upcomingAttendeeGroups.maybe.slice(0, 5).map((person) => (
                          <Image
                            key={`maybe-${person.id}`}
                            source={{ uri: person.avatar }}
                            style={styles.upcomingAttendeeAvatar}
                          />
                        ))}
                      </View>
                    </View>
                    <View style={styles.upcomingAttendeeGroup}>
                      <Text style={styles.upcomingAttendeeGroupLabel}>
                        Invited ({upcomingAttendeeGroups.pending.length})
                      </Text>
                      <View style={styles.upcomingAttendeeAvatarRow}>
                        {upcomingAttendeeGroups.pending.slice(0, 5).map((person) => (
                          <Image
                            key={`pending-${person.id}`}
                            source={{ uri: person.avatar }}
                            style={styles.upcomingAttendeeAvatar}
                          />
                        ))}
                      </View>
                    </View>
                  </View>

                  <View
                    onLayout={(event) => {
                      sectionOffsetsRef.current.activity = event.nativeEvent.layout.y;
                    }}
                    style={styles.upcomingPanelCard}
                  >
                    <View style={styles.upcomingPanelHeader}>
                      <View style={styles.upcomingPanelHeaderLeft}>
                        <Ionicons color={theme.colors.accentPink} name="flash" size={16} />
                        <Text style={styles.upcomingPanelTitle}>Activity</Text>
                      </View>
                      <Text style={styles.upcomingPanelActionLink}>See all</Text>
                    </View>
                    <View style={styles.upcomingActivityList}>
                      {upcomingActivity.map((item) => (
                        <View key={item.id} style={styles.upcomingActivityItem}>
                          <View style={styles.upcomingActivityLead}>
                            {item.imageUrl ? (
                              <Image
                                source={{ uri: item.imageUrl }}
                                style={styles.upcomingActivityThumb}
                              />
                            ) : (
                              <View style={styles.upcomingActivityIcon}>
                                <Ionicons color={theme.colors.textPrimary} name={item.icon} size={14} />
                              </View>
                            )}
                            <View style={styles.upcomingActivityCopy}>
                              <Text style={styles.upcomingActivityTitle}>{item.title}</Text>
                              <Text style={styles.upcomingActivityTime}>{item.detail}</Text>
                            </View>
                          </View>
                        </View>
                      ))}
                      {upcomingActivity.length === 0 ? (
                        <Text style={styles.bringListEmptyText}>No activity yet.</Text>
                      ) : null}
                    </View>
                  </View>
                </View>

                <View
                  onLayout={(event) => {
                    sectionOffsetsRef.current.memories = event.nativeEvent.layout.y;
                  }}
                  style={[styles.upcomingPanelCard, styles.upcomingPanelWide]}
                >
                  <View style={styles.upcomingPanelHeader}>
                    <View style={styles.upcomingPanelHeaderLeft}>
                      <Ionicons color={theme.colors.accentPink} name="camera" size={16} />
                      <Text style={styles.upcomingPanelTitle}>Feed</Text>
                    </View>
                    <Pressable
                      onPress={() => scrollToUpcomingSection('memories')}
                      style={styles.upcomingMemoriesAction}
                    >
                      <Text style={styles.upcomingPanelActionLink}>+ Add Photo</Text>
                    </Pressable>
                  </View>
                  <View style={styles.upcomingMemoriesGrid}>
                    {feedPhotos.slice(0, 6).map((photo) => (
                      <Pressable
                        key={photo.id}
                        onPress={() => setExpandedPhoto(photo)}
                        style={styles.upcomingMemoryTile}
                      >
                        <Image
                          source={{ uri: photo.thumbnailUrl || photo.photoUrl }}
                          style={styles.upcomingMemoryImage}
                        />
                      </Pressable>
                    ))}
                    {feedPhotos.length === 0 ? (
                      <View style={styles.upcomingMemoriesEmpty}>
                        <Text style={styles.bringListEmptyText}>
                          Photos will appear here once the shindig starts.
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => setPlannedFeedViewMode('feed')}
                    style={styles.upcomingMemoriesFooter}
                  >
                    <Text style={styles.upcomingPanelFooterLink}>
                      View feed ({feedPhotos.length})
                    </Text>
                  </Pressable>
                </View>
              </View>

              {canCurrentUserClaimBringItems && claimedByMeCount === 0 ? (
                <View style={styles.upcomingBottomCta}>
                  <View style={styles.upcomingBottomCtaCopy}>
                    <Text style={styles.upcomingBottomCtaTitle}>Haven't claimed anything yet!</Text>
                    <Text style={styles.upcomingBottomCtaText}>
                      Pick something to bring and make it epic.
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => scrollToUpcomingSection('bring')}
                    style={styles.upcomingBottomCtaButton}
                  >
                    <Text style={styles.upcomingBottomCtaButtonText}>Browse Items</Text>
                    <Ionicons color={theme.colors.accentPurple} name="arrow-forward" size={16} />
                  </Pressable>
                </View>
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <Modal
            animationType="fade"
            onRequestClose={() => setIsLikeSheetVisible(false)}
            transparent
            visible={isLikeSheetVisible}
          >
            <View style={styles.likeSheetBackdrop}>
              <Pressable
                onPress={() => setIsLikeSheetVisible(false)}
                style={styles.likeSheetDismissArea}
              />
              <View style={styles.likeSheetCard}>
                <View style={styles.likeSheetHeader}>
                  <Text style={styles.likeSheetTitle}>{likeSheetTitle}</Text>
                  <Pressable
                    onPress={() => setIsLikeSheetVisible(false)}
                    style={styles.likeSheetCloseButton}
                  >
                    <Ionicons color={theme.colors.textPrimary} name="close" size={20} />
                  </Pressable>
                </View>
                {isLoadingLikeSheet ? (
                  <Text style={styles.likeSheetEmpty}>Loading likes...</Text>
                ) : likeSheetProfiles.length > 0 ? (
                  <ScrollView
                    contentContainerStyle={styles.likeSheetList}
                    showsVerticalScrollIndicator={false}
                  >
                    {likeSheetProfiles.map((likedBy) => (
                      <View key={likedBy.id} style={styles.likeSheetRow}>
                        <Image source={{ uri: likedBy.avatar }} style={styles.likeSheetAvatar} />
                        <View style={styles.likeSheetCopy}>
                          <Text style={styles.likeSheetName}>{likedBy.name}</Text>
                          <Text style={styles.likeSheetHandle}>
                            {likedBy.handle}
                            {likedBy.city ? ` • ${likedBy.city}` : ''}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                ) : (
                  <Text style={styles.likeSheetEmpty}>No likes yet.</Text>
                )}
              </View>
            </View>
          </Modal>
          <Modal
            animationType="fade"
            onRequestClose={() => setExpandedPhoto(null)}
            transparent
            visible={Boolean(expandedPhoto)}
          >
            <View style={styles.photoViewerBackdrop}>
              <Pressable
                onPress={() => setExpandedPhoto(null)}
                style={styles.photoViewerDismissArea}
              />
              <View style={styles.photoViewerCard}>
                <Pressable
                  onPress={() => setExpandedPhoto(null)}
                  style={styles.photoViewerCloseButton}
                >
                  <Ionicons color="#FFFFFF" name="close" size={22} />
                </Pressable>
                {expandedPhoto ? (
                  <ProgressiveImage
                    containerStyle={styles.photoViewerFrame}
                    imageStyle={styles.photoViewerImage}
                    resizeMode="contain"
                    sourceUri={expandedPhoto.photoUrl}
                  />
                ) : null}
              </View>
            </View>
          </Modal>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            ref={feedScrollRef}
            showsVerticalScrollIndicator={false}
          >
            <PageHeader onBack={handleBackFromFeedScreen} right={headerActions} title="Feed" />

            <View style={styles.feedHeader}>
              <View style={styles.feedHeaderCopy}>
                <View style={styles.feedTitleRow}>
                  <Text style={styles.feedLocation}>{activeFeedShindig.title}</Text>
                  <View
                    style={[
                      styles.stateBadge,
                      activeFeedShindig.state === 'active'
                        ? styles.stateBadgeActive
                        : activeFeedShindig.state === 'planned'
                          ? styles.stateBadgeUpcoming
                          : styles.stateBadgeCompleted,
                    ]}
                  >
                    <Text
                      style={[
                        styles.stateBadgeText,
                        activeFeedShindig.state === 'active'
                          ? styles.stateBadgeTextActive
                          : activeFeedShindig.state === 'planned'
                            ? styles.stateBadgeTextUpcoming
                            : styles.stateBadgeTextCompleted,
                      ]}
                    >
                      {shindigStateLabel(activeFeedShindig.state)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.feedParticipants}>
                  {activeFeedShindig.plannedFor
                    ? `upcoming ${formatPlannedDateLabel(activeFeedShindig.plannedFor)} • `
                    : ''}
                  {activeFeedCreatorLabel} • {feedPhotos.length} photo{feedPhotos.length === 1 ? '' : 's'}
                </Text>
              </View>
              {activeFeedShindig.ownerId === userId ? (
                <View style={styles.feedOwnerControls}>
                  <View style={styles.feedHeaderActions}>
                    {activeFeedShindig.state !== 'completed' ? (
                      <Pressable
                        onPress={handleAddPhotoToOwnedShindig}
                        style={styles.addPhotoHeaderButton}
                      >
                        <Ionicons color="#FFFFFF" name="add" size={22} />
                      </Pressable>
                    ) : null}

                    <Pressable
                      onPress={() => {
                        const nextState =
                          activeFeedShindig.state === 'planned'
                            ? 'active'
                            : activeFeedShindig.state === 'completed'
                              ? 'active'
                              : 'completed';
                        handleUpdateShindigState(nextState);
                      }}
                      style={[
                        styles.stateActionButton,
                        activeFeedShindig.state === 'planned'
                          ? styles.startButton
                          : activeFeedShindig.state === 'completed'
                            ? styles.reactivateButton
                            : styles.completeButton,
                      ]}
                    >
                      <Ionicons
                        color={
                          activeFeedShindig.state === 'planned' ||
                          activeFeedShindig.state === 'completed'
                            ? '#FFFFFF'
                            : theme.colors.textPrimary
                        }
                        name={
                          activeFeedShindig.state === 'planned'
                            ? 'play'
                            : activeFeedShindig.state === 'completed'
                            ? 'refresh-outline'
                            : 'checkmark'
                        }
                        size={20}
                      />
                    </Pressable>
                    <Pressable onPress={openShindigOwnerMenu} style={styles.ownerMenuButton}>
                      <Ionicons color={theme.colors.textPrimary} name="ellipsis-horizontal" size={20} />
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>

            {showCoverPhotoSavedNotice ? (
              <View style={styles.coverPhotoSavedToast}>
                <Ionicons color="#63D89A" name="checkmark-circle" size={18} />
                <Text style={styles.coverPhotoSavedToastText}>Cover photo updated</Text>
              </View>
            ) : null}

            {activeFeedShindig.ownerId === userId &&
            activeFeedShindig.state !== 'completed' &&
            showOwnerPhotoPrompt ? (
              <View style={styles.feedHeaderPromptWrap}>
                <View style={styles.headerPromptCard}>
                  <Text style={styles.requestPromptTitle}>Add another photo</Text>
                  <Text style={styles.requestPromptText}>
                    Take a new photo or choose one from your library for this ShinDig.
                  </Text>
                  <View style={styles.requestPromptActions}>
                    <Pressable
                      disabled={isAddingPhotoToShindig}
                      onPress={() => addPhotoToOwnedShindig('camera')}
                      style={styles.requestPromptButton}
                    >
                      <Text style={styles.requestPromptButtonText}>Take photo</Text>
                    </Pressable>
                    <Pressable
                      disabled={isAddingPhotoToShindig}
                      onPress={() => addPhotoToOwnedShindig('library')}
                      style={styles.requestPromptButton}
                    >
                      <Text style={styles.requestPromptButtonText}>Choose photo</Text>
                    </Pressable>
                  </View>
                  {isAddingPhotoToShindig ? (
                    <Text style={styles.helperText}>Adding photo...</Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {activeFeedShindig.ownerId !== userId ? (
              <View style={styles.requestPhotoWrap}>
                {activeFeedShindig.state !== 'completed' ? (
                  <>
                    <Pressable
                      disabled={isAddingPhotoToShindig}
                      onPress={handleAddPhotoToSharedShindig}
                      style={[
                        styles.requestPhotoButton,
                        isAddingPhotoToShindig && styles.requestPhotoButtonDisabled,
                      ]}
                    >
                      <Text style={styles.requestPhotoButtonText}>
                        {isAddingPhotoToShindig ? 'Adding photo...' : 'Add photo'}
                      </Text>
                    </Pressable>

                    {showPhotoRequestPrompt ? (
                      <View style={styles.requestPromptCard}>
                        <Text style={styles.requestPromptTitle}>Add a photo to this ShinDig</Text>
                        <Text style={styles.requestPromptText}>
                          Take a new photo or choose one from your library. Your photo will appear
                          in the feed right away.
                        </Text>
                        <View style={styles.requestPromptActions}>
                          <Pressable
                            disabled={isAddingPhotoToShindig}
                            onPress={() => addPhotoToSharedShindig('camera')}
                            style={styles.requestPromptButton}
                          >
                            <Text style={styles.requestPromptButtonText}>Take photo</Text>
                          </Pressable>
                          <Pressable
                            disabled={isAddingPhotoToShindig}
                            onPress={() => addPhotoToSharedShindig('library')}
                            style={styles.requestPromptButton}
                          >
                            <Text style={styles.requestPromptButtonText}>Choose photo</Text>
                          </Pressable>
                        </View>
                        {isAddingPhotoToShindig ? (
                          <Text style={styles.helperText}>Adding photo...</Text>
                        ) : null}
                      </View>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.helperText}>
                    This ShinDig is completed. Reactivate it before adding more photos.
                  </Text>
                )}
              </View>
            ) : null}

            {false ? (
              <View style={styles.bringListCard}>
                <View style={styles.bringListHeader}>
                  <View style={styles.bringListHeaderCopy}>
                    <Text style={styles.bringListTitle}>Things to bring</Text>
                    <Text style={styles.bringListSubtitle}>
                      {activeFeedShindig!.ownerId === userId
                        ? 'Add items your guests can claim.'
                        : 'Claim one or more items so the host knows who is bringing what.'}
                    </Text>
                  </View>
                  <View style={styles.bringListCountBadge}>
                    <Text style={styles.bringListCountText}>
                      {activeFeedShindig!.bringItems.length}
                    </Text>
                  </View>
                </View>

                {activeFeedShindig!.ownerId === userId ? (
                  <View style={styles.bringListComposer}>
                    <TextInput
                      onChangeText={setBringItemDraft}
                      onSubmitEditing={() => void handleAddBringItem()}
                      placeholder="Add an item to bring"
                      placeholderTextColor={theme.colors.textMuted}
                      returnKeyType="done"
                      style={styles.bringListInput}
                      value={bringItemDraft}
                    />
                    <Pressable
                      disabled={actingBringItemId === 'new'}
                      onPress={() => void handleAddBringItem()}
                      style={styles.bringListAddButton}
                    >
                      <Text style={styles.bringListAddButtonText}>
                        {actingBringItemId === 'new' ? 'Adding...' : 'Add'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {standardBringItems.length > 0 ? (
                  <View style={styles.bringListItems}>
                    {standardBringItems.map((item) => {
                      const isClaimedByMe = item.claimedBy?.id === userId;
                      const isClaimedByOther =
                        Boolean(item.claimedBy?.id) && item.claimedBy?.id !== userId;

                      return (
                        <View key={item.id} style={styles.bringListItemRow}>
                          <View style={styles.bringListItemCopy}>
                            <Text style={styles.bringListItemLabel}>{item.label}</Text>
                            <Text style={styles.bringListItemMeta}>
                              {item.claimedBy
                                ? isClaimedByMe
                                  ? 'You are bringing this'
                                  : `${item.claimedBy.name} is bringing this`
                                : 'Still available'}
                            </Text>
                          </View>

                          {activeFeedShindig!.ownerId === userId ? (
                            <Pressable
                              disabled={actingBringItemId === item.id}
                              onPress={() => void handleDeleteBringItem(item.id)}
                              style={styles.bringListDeleteButton}
                            >
                              <Ionicons color="#FF8A80" name="trash-outline" size={18} />
                            </Pressable>
                          ) : canCurrentUserClaimBringItems ? (
                            <Pressable
                              disabled={actingBringItemId === item.id || isClaimedByOther}
                              onPress={() => void handleClaimBringItem(item)}
                              style={[
                                styles.bringListClaimButton,
                                !isClaimedByMe &&
                                  !isClaimedByOther &&
                                  styles.bringListClaimButtonPrimary,
                                isClaimedByOther && styles.bringListClaimButtonDisabled,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.bringListClaimButtonText,
                                  !isClaimedByMe &&
                                    !isClaimedByOther &&
                                    styles.bringListClaimButtonTextPrimary,
                                  isClaimedByOther && styles.bringListClaimButtonTextDisabled,
                                ]}
                              >
                                {actingBringItemId === item.id
                                  ? 'Saving...'
                                  : isClaimedByMe
                                    ? 'Undo'
                                    : isClaimedByOther
                                      ? 'Taken'
                                      : 'I’ll bring it'}
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.bringListEmptyText}>
                    {activeFeedShindig!.ownerId === userId
                      ? 'No bring-list items yet.'
                      : 'The host has not added a bring list yet.'}
                  </Text>
                )}

                {canCurrentUserClaimBringItems || customBringItems.length > 0 ? (
                  <View style={styles.customBringSection}>
                    <Text style={styles.customBringTitle}>Other</Text>
                    <Text style={styles.customBringSubtitle}>
                      {canCurrentUserClaimBringItems
                        ? 'Add a custom item if you are bringing something not listed above.'
                        : 'Custom items invited guests added for this ShinDig.'}
                    </Text>
                    {canCurrentUserClaimBringItems ? (
                      <View style={styles.bringListComposer}>
                        <TextInput
                          onChangeText={setCustomBringItemDraft}
                          onSubmitEditing={() => void handleAddCustomBringItem()}
                          placeholder="Type a custom item"
                          placeholderTextColor={theme.colors.textMuted}
                          returnKeyType="done"
                          style={styles.bringListInput}
                          value={customBringItemDraft}
                        />
                        <Pressable
                          disabled={actingBringItemId === 'custom-new'}
                          onPress={() => void handleAddCustomBringItem()}
                          style={styles.bringListAddButton}
                        >
                          <Text style={styles.bringListAddButtonText}>
                            {actingBringItemId === 'custom-new' ? 'Adding...' : 'Add'}
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}

                    {customBringItems.length > 0 ? (
                      <View style={styles.bringListItems}>
                        {customBringItems.map((item) => {
                          const isClaimedByMe = item.claimedBy?.id === userId;
                          const isClaimedByOther =
                            Boolean(item.claimedBy?.id) && item.claimedBy?.id !== userId;
                          const canRemoveCustomItem =
                            activeFeedShindig!.ownerId === userId || isClaimedByMe;

                          return (
                            <View key={item.id} style={styles.bringListItemRow}>
                              <View style={styles.bringListItemCopy}>
                                <Text style={styles.bringListItemLabel}>{item.label}</Text>
                                <Text style={styles.bringListItemMeta}>
                                  {item.claimedBy
                                    ? isClaimedByMe
                                      ? 'You added this custom item'
                                      : `${item.claimedBy.name} added this custom item`
                                    : 'Custom item'}
                                </Text>
                              </View>

                              {canRemoveCustomItem ? (
                                <Pressable
                                  disabled={actingBringItemId === item.id}
                                  onPress={() => void handleDeleteBringItem(item.id)}
                                  style={[
                                    styles.bringListClaimButton,
                                    isClaimedByMe && styles.bringListClaimButtonPrimary,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.bringListClaimButtonText,
                                      isClaimedByMe && styles.bringListClaimButtonTextPrimary,
                                    ]}
                                  >
                                    {activeFeedShindig!.ownerId === userId && !isClaimedByMe
                                      ? 'Delete'
                                      : 'Remove'}
                                  </Text>
                                </Pressable>
                              ) : (
                                <View
                                  style={[
                                    styles.bringListClaimButton,
                                    styles.bringListClaimButtonDisabled,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.bringListClaimButtonText,
                                      styles.bringListClaimButtonTextDisabled,
                                    ]}
                                  >
                                    {isClaimedByOther ? 'Added' : 'Custom'}
                                  </Text>
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={styles.feedCollectionCard}>
              <View style={styles.feedStack}>
                {feedPhotos.map((photo) => (
                  <View
                    key={photo.id}
                    onLayout={(event) => {
                      photoOffsetsRef.current[photo.id] = event.nativeEvent.layout.y;
                    }}
                    style={[
                      styles.feedCard,
                      highlightedPhotoId === photo.id && styles.feedCardHighlighted,
                    ]}
                  >
                    <View style={styles.feedCardHeader}>
                      <View style={styles.feedCardHeaderMain}>
                        <View style={styles.feedAuthorTopRow}>
                          <Text style={styles.feedAuthor}>
                            {photo.contributor?.name || activeFeedOwner?.name || 'ShinDig Owner'}
                          </Text>
                          {activeFeedShindig.coverPhotoPhotoId === photo.id ? (
                            <View style={styles.coverPhotoBadge}>
                              <Text style={styles.coverPhotoBadgeText}>Cover</Text>
                            </View>
                          ) : null}
                        </View>
                        {photo.contributor ? (
                          <View style={styles.photoCreditBadge}>
                            <Text style={styles.photoCredit}>via {photo.contributor.handle}</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.feedCardHeaderActions}>
                        <Text style={styles.feedTime}>{formatRelativeTimestamp(photo.createdAt)}</Text>
                        <Pressable
                          onPress={() => openPhotoOwnerMenu(photo)}
                          style={styles.photoMenuButton}
                        >
                          <Ionicons
                            color={theme.colors.textMuted}
                            name="ellipsis-horizontal"
                            size={18}
                          />
                        </Pressable>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => setExpandedPhoto(photo)}
                      style={styles.feedPhotoPressable}
                    >
                      <ProgressiveImage
                        containerStyle={styles.feedPhotoFrame}
                        imageStyle={styles.feedPhoto}
                        resizeMode="contain"
                        sourceUri={photo.thumbnailUrl || photo.photoUrl}
                      />
                    </Pressable>
                    <View style={styles.socialRow}>
                      <Pressable
                        delayLongPress={180}
                        onLongPress={() => void handleOpenPhotoLikeSheet(photo)}
                        onPress={() => handleTogglePhotoLike(photo.id)}
                        style={styles.socialButton}
                      >
                        <Ionicons
                          color={photo.likedByMe ? '#FF8A5B' : theme.colors.textPrimary}
                          name={photo.likedByMe ? 'heart' : 'heart-outline'}
                          size={18}
                        />
                        <Text style={styles.socialButtonText}>{photo.likeCount}</Text>
                      </Pressable>
                      <View style={styles.socialStat}>
                        <Ionicons
                          color={theme.colors.textMuted}
                          name="chatbubble-outline"
                          size={17}
                        />
                        <Text style={styles.socialMeta}>{photo.comments.length}</Text>
                      </View>
                    </View>
                    <View style={styles.commentComposer}>
                      <TextInput
                        onChangeText={(value) =>
                          setPhotoCommentDrafts((current) => ({ ...current, [photo.id]: value }))
                        }
                        placeholder="Comment on this photo"
                        placeholderTextColor={theme.colors.textMuted}
                        style={styles.commentInput}
                        value={photoCommentDrafts[photo.id] || ''}
                      />
                      <Pressable
                        onPress={() => handleAddPhotoComment(photo.id)}
                        style={styles.commentButton}
                      >
                        <Text style={styles.commentButtonText}>Post</Text>
                      </Pressable>
                    </View>
                    <View style={styles.commentList}>
                      {photo.comments.map((comment) => (
                        <View key={comment.id} style={styles.commentItem}>
                          <View style={styles.commentHeader}>
                            <View style={styles.commentHeaderCopy}>
                              <Text style={styles.commentAuthor}>{comment.author.name}</Text>
                              <Text style={styles.commentTimestamp}>
                                {formatCommentTimestamp(comment.createdAt)}
                              </Text>
                            </View>
                            {comment.author.id === userId ? (
                              <Pressable onPress={() => handleDeletePhotoComment(comment.id)}>
                                <Text style={styles.commentDelete}>Delete</Text>
                              </Pressable>
                            ) : null}
                          </View>
                          <Text style={styles.commentBody}>{comment.body}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.shindigSocialFooter}>
                <View style={styles.socialRow}>
                  <Pressable onPress={handleToggleShindigLike} style={styles.socialButton}>
                    <Ionicons
                      color={activeFeedShindig.likedByMe ? '#FF8A5B' : theme.colors.textPrimary}
                      name={activeFeedShindig.likedByMe ? 'heart' : 'heart-outline'}
                      size={18}
                    />
                    <Text style={styles.socialButtonText}>{activeFeedShindig.likeCount}</Text>
                  </Pressable>
                  <View style={styles.socialStat}>
                    <Ionicons
                      color={theme.colors.textMuted}
                      name="chatbubble-outline"
                      size={17}
                    />
                    <Text style={styles.socialMeta}>{activeFeedShindig.comments.length}</Text>
                  </View>
                  {isRefreshingFeed ? <Text style={styles.socialMeta}>Updating...</Text> : null}
                </View>

                <View style={styles.commentComposer}>
                  <TextInput
                    onChangeText={setShindigCommentDraft}
                    placeholder="Comment on this ShinDig"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.commentInput}
                    value={shindigCommentDraft}
                  />
                  <Pressable onPress={handleAddShindigComment} style={styles.commentButton}>
                    <Text style={styles.commentButtonText}>Post</Text>
                  </Pressable>
                </View>

                <View style={styles.commentList}>
                  {activeFeedShindig.comments.map((comment) => (
                    <View key={comment.id} style={styles.commentItem}>
                      <View style={styles.commentHeader}>
                        <View style={styles.commentHeaderCopy}>
                          <Text style={styles.commentAuthor}>{comment.author.name}</Text>
                          <Text style={styles.commentTimestamp}>
                            {formatCommentTimestamp(comment.createdAt)}
                          </Text>
                        </View>
                        {comment.author.id === userId ? (
                          <Pressable onPress={() => handleDeleteShindigComment(comment.id)}>
                            <Text style={styles.commentDelete}>Delete</Text>
                          </Pressable>
                        ) : null}
                      </View>
                      <Text style={styles.commentBody}>{comment.body}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <Modal
          animationType="fade"
          onRequestClose={() => setIsAiCoverModalOpen(false)}
          transparent
          visible={isAiCoverModalOpen}
        >
          <View style={styles.aiCoverBackdrop}>
            <Pressable
              onPress={() => !isGeneratingAiCover && setIsAiCoverModalOpen(false)}
              style={styles.aiCoverDismissArea}
            />
            <View style={styles.aiCoverCard}>
              <Text style={styles.aiCoverTitle}>Generate AI Cover</Text>
              <Text style={styles.aiCoverSubtitle}>
                Describe the vibe, scene, colors, or mood for this upcoming ShinDig cover.
              </Text>
              <TextInput
                multiline
                onChangeText={setAiCoverPrompt}
                placeholder="Example: rooftop summer party at golden hour, pink neon glow, stylish crowd, cinematic editorial"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.aiCoverInput}
                value={aiCoverPrompt}
              />
              <View style={styles.aiCoverActions}>
                <Pressable
                  disabled={isGeneratingAiCover}
                  onPress={() => setIsAiCoverModalOpen(false)}
                  style={styles.aiCoverSecondaryButton}
                >
                  <Text style={styles.aiCoverSecondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={isGeneratingAiCover}
                  onPress={() => void handleGenerateAiCover()}
                  style={styles.aiCoverPrimaryButton}
                >
                  <Text style={styles.aiCoverPrimaryButtonText}>
                    {isGeneratingAiCover ? 'Generating...' : 'Generate'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <PageHeader
            onBack={() => setStep('welcome')}
            right={headerActions}
            title={step === 'create' ? 'Create' : 'Invite'}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {step === 'create' ? (
            <View style={styles.panel}>
              <Text style={styles.fieldLabel}>Date*</Text>
              <View style={styles.plannedDateSection}>
                <Pressable
                  onPress={() => {
                    setShowPlannedTimePicker(false);
                    setShowPlannedDatePicker((current) => !current);
                  }}
                  style={styles.plannedDateButton}
                >
                  <Ionicons color={theme.colors.accentSoft} name="calendar-outline" size={18} />
                  <Text style={styles.plannedDateButtonText}>
                    {new Date(plannedFor).toLocaleDateString('en-US', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Text>
                </Pressable>
                {showPlannedDatePicker ? (
                  <View style={styles.plannedDatePickerWrap}>
                    <DateTimePicker
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      minimumDate={new Date()}
                      mode="date"
                      onChange={(event: DateTimePickerEvent, nextValue?: Date) => {
                        if (Platform.OS !== 'ios') {
                          setShowPlannedDatePicker(false);
                        }

                        if (event.type === 'set' && nextValue) {
                          const merged = new Date(plannedFor);
                          merged.setFullYear(
                            nextValue.getFullYear(),
                            nextValue.getMonth(),
                            nextValue.getDate()
                          );
                          setPlannedFor(merged);
                        }
                      }}
                      textColor={theme.colors.textPrimary}
                      themeVariant="dark"
                      value={plannedFor}
                    />
                  </View>
                ) : null}

                <Text style={[styles.fieldLabel, styles.spacedLabel]}>Start Time*</Text>
                <Pressable
                  onPress={() => {
                    setShowPlannedDatePicker(false);
                    setShowPlannedTimePicker((current) => !current);
                  }}
                  style={styles.plannedDateButton}
                >
                  <Ionicons color={theme.colors.accentSoft} name="time-outline" size={18} />
                  <Text style={styles.plannedDateButtonText}>
                    {formatPlannedTimeLabel(plannedFor.toISOString())}
                  </Text>
                </Pressable>
                {showPlannedTimePicker ? (
                  <View style={styles.plannedDatePickerWrap}>
                    <DateTimePicker
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      mode="time"
                      onChange={(event: DateTimePickerEvent, nextValue?: Date) => {
                        if (Platform.OS !== 'ios') {
                          setShowPlannedTimePicker(false);
                        }

                        if (event.type === 'set' && nextValue) {
                          const merged = new Date(plannedFor);
                          merged.setHours(nextValue.getHours(), nextValue.getMinutes(), 0, 0);
                          setPlannedFor(merged);
                        }
                      }}
                      textColor={theme.colors.textPrimary}
                      themeVariant="dark"
                      value={plannedFor}
                    />
                  </View>
                ) : null}
              </View>

              <Text style={styles.fieldLabel}>Shindig Name*</Text>
              <TextInput
                onChangeText={setShindigName}
                placeholder="Give this ShinDig a name"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                value={shindigName}
              />

              <Text style={[styles.fieldLabel, styles.spacedLabel]}>Location*</Text>
              <TextInput
                onChangeText={(value) => {
                  setLocationQuery(value);
                  setSelectedLocation(null);
                  setError('');
                }}
                placeholder="Search address or type any place"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                value={locationQuery}
              />
              {isLoadingLocation ? (
                <Text style={styles.helperText}>Getting your location...</Text>
              ) : null}
              {isSearchingLocations ? (
                <Text style={styles.helperText}>Searching nearby places...</Text>
              ) : null}

              <View style={styles.suggestionList}>
                {locationResults.map((place) => (
                  <Pressable
                    key={place.id}
                    onPress={() => selectLocation(place)}
                    style={styles.suggestionItem}
                  >
                    <Text style={styles.suggestionTitle}>{place.title}</Text>
                    <Text style={styles.suggestionMeta}>{place.address}</Text>
                  </Pressable>
                ))}
                {!isSearchingLocations &&
                deferredLocationQuery.trim().length >= 2 &&
                locationResults.length === 0 ? (
                  <Text style={styles.helperText}>
                    No exact match found. You can still continue with the typed location.
                  </Text>
                ) : null}
              </View>

              <Text style={[styles.fieldLabel, styles.spacedLabel]}>
                {shindigTiming === 'planned' ? 'Cover Photo' : 'Add Photo'}
              </Text>
              {shindigTiming === 'planned' ? (
                <Text style={styles.helperText}>
                  Choose one cover photo now. More photos can be added after the ShinDig starts.
                </Text>
              ) : null}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.photoRow}>
                  <Pressable onPress={openPhotoSourcePicker} style={styles.addPhotoCard}>
                    <Text style={styles.addPhotoPlus}>+</Text>
                    <Text style={styles.addPhotoText}>
                      {shindigTiming === 'planned' ? 'Choose Cover' : 'Add Photo'}
                    </Text>
                  </Pressable>
                  {shindigTiming === 'planned' ? (
                    <View style={styles.aiPhotoCardDisabled}>
                      <View style={styles.aiPhotoCard}>
                      <Ionicons color={theme.colors.accentPink} name="sparkles" size={24} />
                      <Text style={styles.aiPhotoCardTitle}>AI Cover</Text>
                      <Text style={styles.aiPhotoCardText}>Prompt a cover image</Text>
                      </View>
                      <View style={styles.comingSoonOverlay}>
                        <Text style={styles.comingSoonOverlayText}>Coming Soon</Text>
                      </View>
                    </View>
                  ) : null}
                  {photos.map((photo) => (
                    <View key={photo.localUri} style={styles.photoPreviewWrap}>
                      <Image source={{ uri: photo.localUri }} style={styles.photoPreview} />
                      {photo.isPreferredCover ? (
                        <View style={styles.generatedCoverBadge}>
                          <Text style={styles.generatedCoverBadgeText}>Cover</Text>
                        </View>
                      ) : null}
                      <Pressable
                        onPress={() => removePhoto(photo.localUri)}
                        style={styles.removePhotoButton}
                      >
                        <Text style={styles.removePhotoText}>x</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </ScrollView>

              <Pressable onPress={continueToInvite} style={styles.ctaButton}>
                <Text style={styles.ctaButtonText}>Continue</Text>
              </Pressable>
            </View>
          ) : null}

          {step === 'invite' ? (
            <View style={styles.panel}>
              {!isInvitePickerOpen ? (
                <View style={styles.inviteIntroCard}>
                  <Text style={styles.inviteHeroTitle}>Invite people to this ShinDig</Text>
                  <Text style={styles.inviteSubtitle}>
                    Choose friends and contacts to invite to this future ShinDig. Invited
                    people can accept, reject, or maybe.
                  </Text>
                  <View style={styles.inviteSummaryRow}>
                    <View style={styles.inviteSummaryPill}>
                      <Text style={styles.inviteSummaryValue}>{selectedContacts.length}</Text>
                      <Text style={styles.inviteSummaryLabel}>Phone Contacts</Text>
                    </View>
                    <View style={styles.inviteSummaryPill}>
                      <Text style={styles.inviteSummaryValue}>{selectedFriends.length}</Text>
                      <Text style={styles.inviteSummaryLabel}>ShinDig Friends</Text>
                    </View>
                  </View>
                  <Pressable onPress={() => void openInvitePicker()} style={styles.ctaButton}>
                    <Text style={styles.ctaButtonText}>Select Contacts</Text>
                  </Pressable>
                  <Pressable
                    disabled={isSavingShindig}
                    onPress={skipInvites}
                    style={styles.secondaryTextButton}
                  >
                    <Text style={styles.secondaryTextButtonLabel}>
                      {isSavingShindig ? 'Starting...' : 'Select Contacts Later'}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.invitePickerCard}>
                  <View style={styles.invitePickerHeader}>
                    <Pressable onPress={closeInvitePicker} style={styles.inlineBackButton}>
                      <Ionicons color={theme.colors.accentSoft} name="chevron-back" size={22} />
                      <Text style={styles.inlineBackLabel}>Back</Text>
                    </Pressable>
                    <Text style={styles.invitePickerTitle}>Select Contacts</Text>
                    <View style={styles.inlineBackSpacer} />
                  </View>

                  <TextInput
                    onChangeText={(value) => {
                      setInviteSearch(value);
                      setError('');
                    }}
                    placeholder="Search friends and ShinDig users..."
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.input}
                    value={inviteSearch}
                  />

                  {isSearchingInviteUsers ? (
                    <Text style={styles.helperText}>Searching ShinDig users...</Text>
                  ) : null}

                  {friends.length > 0 ? (
                    <>
                      <View style={styles.inviteSectionHeader}>
                        <Text style={styles.inviteSectionLabel}>Friends On ShinDig</Text>
                        <Pressable
                          onPress={toggleAllVisibleFriends}
                          style={styles.inviteSectionAction}
                        >
                          <Text style={styles.inviteSectionActionText}>
                            {filteredFriends.length > 0 &&
                            filteredFriends.every((friend) =>
                              selectedFriendIds.includes(friend.id)
                            )
                              ? 'Deselect All'
                              : 'Select All'}
                          </Text>
                        </Pressable>
                      </View>
                      <View style={styles.contactList}>
                        {filteredFriends.map((friend) => {
                          const isSelected = selectedFriendIds.includes(friend.id);
                          return (
                            <Pressable
                              key={friend.id}
                              onPress={() => toggleFriend(friend.id)}
                              style={styles.contactItem}
                            >
                              <View
                                style={[
                                  styles.contactCheckbox,
                                  isSelected && styles.contactCheckboxActive,
                                ]}
                              >
                                <Text style={styles.contactCheckboxText}>
                                  {isSelected ? 'x' : ''}
                                </Text>
                              </View>
                              <View style={styles.contactCopy}>
                                <Text style={styles.contactName}>{friend.name}</Text>
                                <Text style={styles.contactPhone}>
                                  {friend.handle} {friend.city ? ` | ${friend.city}` : ''}
                                </Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  ) : null}

                  {inviteSearch.trim().length >= 2 ? (
                    <>
                      <Text style={styles.inviteSectionLabel}>Other Users On ShinDig</Text>
                      {inviteSearchResults.length > 0 ? (
                        <View style={styles.contactList}>
                          {inviteSearchResults.map((profile) => {
                            const isSelected = Boolean(selectedInviteUsersById[profile.id]);
                            return (
                              <Pressable
                                key={profile.id}
                                onPress={() => toggleInviteUser(profile)}
                                style={styles.contactItem}
                              >
                                <View
                                  style={[
                                    styles.contactCheckbox,
                                    isSelected && styles.contactCheckboxActive,
                                  ]}
                                >
                                  <Text style={styles.contactCheckboxText}>
                                    {isSelected ? 'x' : ''}
                                  </Text>
                                </View>
                                <View style={styles.contactCopy}>
                                  <Text style={styles.contactName}>{profile.name}</Text>
                                  <Text style={styles.contactPhone}>
                                    {profile.handle} {profile.city ? ` | ${profile.city}` : ''}
                                  </Text>
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : !isSearchingInviteUsers ? (
                        <Text style={styles.helperText}>
                          No other ShinDig users matched that search.
                        </Text>
                      ) : null}
                    </>
                  ) : null}

                  <Text style={styles.inviteSectionLabel}>Phone Contacts</Text>
                  {isLoadingContacts ? (
                    <Text style={styles.helperText}>Loading contacts...</Text>
                  ) : (
                    <>
                      {contacts.length === 0 ? (
                        <Text style={styles.helperText}>
                          No phone contacts with numbers were returned from your device right now.
                        </Text>
                      ) : (
                        <View style={styles.contactList}>
                          {filteredContacts.map((contact) => {
                            const isSelected = Boolean(selectedContactsById[contact.id]);
                            return (
                              <Pressable
                                key={contact.id}
                                onPress={() => toggleContact(contact)}
                                style={styles.contactItem}
                              >
                                <View
                                  style={[
                                    styles.contactCheckbox,
                                    isSelected && styles.contactCheckboxActive,
                                  ]}
                                >
                                  <Text style={styles.contactCheckboxText}>
                                    {isSelected ? 'x' : ''}
                                  </Text>
                                </View>
                                <View style={styles.contactCopy}>
                                  <Text style={styles.contactName}>{contact.name}</Text>
                                  <Text style={styles.contactPhone}>{contact.phoneNumber}</Text>
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      )}
                    </>
                  )}

                  {selectedContacts.length > 0 ? (
                    <View style={styles.contactList}>
                      {selectedContacts.map((contact) => (
                        <Pressable
                          key={contact.id}
                          onPress={() => toggleContact(contact)}
                          style={styles.contactItem}
                        >
                          <View style={[styles.contactCheckbox, styles.contactCheckboxActive]}>
                            <Text style={styles.contactCheckboxText}>x</Text>
                          </View>
                          <View style={styles.contactCopy}>
                            <Text style={styles.contactName}>{contact.name}</Text>
                            <Text style={styles.contactPhone}>{contact.phoneNumber}</Text>
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.helperText}>
                      No phone contacts selected yet. Search or load contacts from your phone.
                    </Text>
                  )}

                  {selectedInviteUsers.length > 0 ? (
                    <>
                      <Text style={styles.inviteSectionLabel}>Selected ShinDig Users</Text>
                      <View style={styles.contactList}>
                        {selectedInviteUsers.map((profile) => (
                          <Pressable
                            key={profile.id}
                            onPress={() => toggleInviteUser(profile)}
                            style={styles.contactItem}
                          >
                            <View style={[styles.contactCheckbox, styles.contactCheckboxActive]}>
                              <Text style={styles.contactCheckboxText}>x</Text>
                            </View>
                            <View style={styles.contactCopy}>
                              <Text style={styles.contactName}>{profile.name}</Text>
                              <Text style={styles.contactPhone}>
                                {profile.handle} {profile.city ? ` | ${profile.city}` : ''}
                              </Text>
                            </View>
                          </Pressable>
                        ))}
                      </View>
                    </>
                  ) : null}

                  <Pressable
                    disabled={
                      isSavingShindig ||
                      selectedContacts.length + selectedFriends.length + selectedInviteUsers.length === 0
                    }
                    onPress={saveShindigAndOpenFeed}
                    style={[
                      styles.ctaButton,
                      (isSavingShindig ||
                        selectedContacts.length +
                          selectedFriends.length +
                          selectedInviteUsers.length ===
                          0) &&
                        styles.buttonDisabled,
                    ]}
                  >
                    <Text style={styles.ctaButtonText}>
                      {isSavingShindig
                        ? 'Starting...'
                        : `Continue with ${
                            selectedContacts.length +
                            selectedFriends.length +
                            selectedInviteUsers.length
                          }`}
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={isSavingShindig}
                    onPress={skipInvites}
                    style={styles.secondaryTextButton}
                  >
                    <Text style={styles.secondaryTextButtonLabel}>Select Contacts Later</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxxl,
    paddingTop: 28,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  topSpacer: {
    width: 52,
  },
  backButton: {
    alignItems: 'center',
    height: 52,
    justifyContent: 'center',
    marginLeft: -14,
    width: 52,
  },
  avatarButton: {
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.round,
    borderWidth: 2,
    padding: 2,
  },
  avatar: {
    borderRadius: theme.radius.round,
    height: 54,
    width: 54,
  },
  ctaButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentPink,
    borderColor: 'rgba(255, 196, 184, 0.5)',
    borderRadius: theme.radius.round,
    borderWidth: 1,
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    shadowColor: theme.colors.accentPink,
    shadowOffset: {
      height: 8,
      width: 0,
    },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    width: '100%',
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  timingToggleRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  timingToggleButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.round,
    borderWidth: 1,
    flex: 1,
    paddingVertical: theme.spacing.sm,
  },
  timingToggleButtonActive: {
    backgroundColor: 'rgba(255, 79, 160, 0.18)',
    borderColor: theme.colors.accentPink,
  },
  timingToggleText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  timingToggleTextActive: {
    color: theme.colors.textPrimary,
  },
  plannedDateSection: {
    marginBottom: theme.spacing.lg,
  },
  plannedDateButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  plannedDateButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  plannedDatePickerWrap: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    marginTop: theme.spacing.sm,
    overflow: 'hidden',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  sectionHeader: {
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  pastList: {
    gap: theme.spacing.sm,
  },
  pastCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderStrong,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    padding: theme.spacing.sm,
  },
  pastCardImage: {
    borderRadius: 12,
    height: 54,
    width: 54,
  },
  pastCardCopy: {
    flex: 1,
    marginLeft: theme.spacing.sm,
  },
  pastCardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  pastCardMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  invitedByTag: {
    color: theme.colors.accentPink,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  upcomingInviteActions: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  upcomingInviteButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentPink,
    borderRadius: theme.radius.round,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 68,
    paddingHorizontal: theme.spacing.sm,
  },
  upcomingInviteButtonSecondary: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.round,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 68,
    paddingHorizontal: theme.spacing.sm,
  },
  upcomingInviteButtonActive: {
    borderColor: theme.colors.accentPink,
    borderWidth: 1,
  },
  upcomingInviteRejectActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: theme.colors.textMuted,
  },
  upcomingInviteButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyText: {
    color: theme.colors.textMuted,
    lineHeight: 22,
  },
  screenTitle: {
    color: theme.colors.accentPink,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -1,
  },
  panel: {
    marginTop: theme.spacing.xl,
  },
  fieldLabel: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: theme.spacing.sm,
  },
  spacedLabel: {
    marginTop: theme.spacing.lg,
  },
  photoRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  addPhotoCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.accentPink,
    borderRadius: 22,
    borderStyle: 'dashed',
    borderWidth: 1,
    height: 108,
    justifyContent: 'center',
    width: 108,
  },
  addPhotoPlus: {
    color: theme.colors.textPrimary,
    fontSize: 30,
    lineHeight: 34,
  },
  addPhotoText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    marginTop: theme.spacing.xs,
  },
  aiPhotoCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: 'rgba(255, 79, 160, 0.42)',
    borderRadius: 22,
    borderWidth: 1,
    height: 108,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
    width: 132,
  },
  aiPhotoCardDisabled: {
    position: 'relative',
  },
  aiPhotoCardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    marginTop: theme.spacing.xs,
  },
  aiPhotoCardText: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  comingSoonOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(4, 8, 18, 0.72)',
    borderRadius: 22,
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  comingSoonOverlayText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  photoPreviewWrap: {
    position: 'relative',
  },
  photoPreview: {
    borderRadius: theme.radius.lg,
    height: 108,
    width: 108,
  },
  generatedCoverBadge: {
    backgroundColor: theme.colors.accentPink,
    borderRadius: theme.radius.round,
    left: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'absolute',
    top: 6,
    zIndex: 1,
  },
  generatedCoverBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  removePhotoButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(8, 11, 22, 0.8)',
    borderRadius: theme.radius.round,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 6,
    top: 6,
    width: 24,
  },
  removePhotoText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    backgroundColor: theme.colors.backgroundAlt,
    borderColor: theme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    color: theme.colors.textPrimary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  helperText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: theme.spacing.sm,
  },
  aiCoverBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(4, 8, 18, 0.76)',
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  aiCoverDismissArea: {
    ...StyleSheet.absoluteFillObject,
  },
  aiCoverCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderStrong,
    borderRadius: 24,
    borderWidth: 1,
    padding: theme.spacing.lg,
    width: '100%',
  },
  aiCoverTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  aiCoverSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    marginTop: theme.spacing.sm,
  },
  aiCoverInput: {
    backgroundColor: theme.colors.backgroundAlt,
    borderColor: theme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.lg,
    minHeight: 132,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    textAlignVertical: 'top',
  },
  aiCoverActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  aiCoverSecondaryButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.round,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: theme.spacing.md,
  },
  aiCoverSecondaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  aiCoverPrimaryButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentPink,
    borderRadius: theme.radius.round,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: theme.spacing.md,
  },
  aiCoverPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  suggestionList: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  suggestionItem: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 20,
    borderWidth: 1,
    padding: theme.spacing.md,
  },
  suggestionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  suggestionMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  inviteSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  inviteIntroCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderStrong,
    borderRadius: 30,
    borderWidth: 1,
    padding: theme.spacing.lg,
  },
  inviteHeroTitle: {
    color: theme.colors.accentPink,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -1,
    textAlign: 'center',
  },
  inviteSummaryRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  inviteSummaryPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 35, 62, 0.88)',
    borderColor: theme.colors.border,
    borderRadius: 22,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  inviteSummaryValue: {
    color: '#E2B8FF',
    fontSize: 24,
    fontWeight: '800',
  },
  inviteSummaryLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  invitePickerCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderStrong,
    borderRadius: 30,
    borderWidth: 1,
    padding: theme.spacing.lg,
  },
  invitePickerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
  },
  invitePickerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.9,
  },
  inlineBackButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    minWidth: 72,
  },
  inlineBackLabel: {
    color: theme.colors.accentSoft,
    fontSize: 15,
    fontWeight: '700',
  },
  inlineBackSpacer: {
    minWidth: 72,
  },
  inviteSectionLabel: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  inviteSectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.lg,
  },
  inviteSectionAction: {
    backgroundColor: 'rgba(23, 35, 62, 0.96)',
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.round,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  inviteSectionActionText: {
    color: theme.colors.accentPink,
    fontSize: 13,
    fontWeight: '700',
  },
  contactList: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  contactItem: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 35, 62, 0.88)',
    borderColor: theme.colors.border,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  contactCheckbox: {
    alignItems: 'center',
    borderColor: theme.colors.textMuted,
    borderRadius: theme.radius.round,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  contactCheckboxActive: {
    backgroundColor: theme.colors.accentPink,
    borderColor: theme.colors.accentPink,
  },
  contactCheckboxText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  contactCopy: {
    marginLeft: theme.spacing.md,
  },
  contactName: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  contactPhone: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  errorText: {
    color: '#FF9F8A',
    marginTop: theme.spacing.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  secondaryTextButton: {
    alignItems: 'center',
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  secondaryTextButtonLabel: {
    color: theme.colors.accentSoft,
    fontSize: 16,
    fontWeight: '700',
  },
  feedHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.md,
  },
  feedHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  feedHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: theme.spacing.sm,
    marginLeft: theme.spacing.md,
  },
  feedOwnerControls: {
    alignItems: 'flex-end',
    flexShrink: 0,
    marginLeft: theme.spacing.md,
  },
  feedHeaderPromptWrap: {
    marginTop: theme.spacing.md,
    width: '100%',
  },
  coverPhotoSavedToast: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(12, 20, 36, 0.96)',
    borderColor: 'rgba(99, 216, 154, 0.28)',
    borderRadius: theme.radius.round,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  coverPhotoSavedToastText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  feedTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  feedLocation: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
  },
  feedParticipants: {
    color: theme.colors.textMuted,
    fontSize: 14,
    marginTop: 4,
  },
  addPhotoHeaderButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentPink,
    borderRadius: theme.radius.round,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  stateActionButton: {
    alignItems: 'center',
    borderRadius: theme.radius.round,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  ownerMenuButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.round,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  completeButton: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  startButton: {
    backgroundColor: theme.colors.accentPink,
  },
  reactivateButton: {
    backgroundColor: '#2E8B57',
  },
  headerPromptCard: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    padding: theme.spacing.md,
    width: '100%',
  },
  stateBadge: {
    borderRadius: theme.radius.round,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  stateBadgeActive: {
    backgroundColor: 'rgba(46, 139, 87, 0.18)',
  },
  stateBadgeUpcoming: {
    backgroundColor: 'rgba(255, 79, 160, 0.16)',
  },
  stateBadgeCompleted: {
    backgroundColor: 'rgba(132, 144, 176, 0.18)',
  },
  stateBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  stateBadgeTextActive: {
    color: '#63D89A',
  },
  stateBadgeTextUpcoming: {
    color: theme.colors.accentPink,
  },
  stateBadgeTextCompleted: {
    color: theme.colors.textMuted,
  },
  feedStack: {
    gap: theme.spacing.lg,
  },
  feedCollectionCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    marginTop: theme.spacing.lg,
    padding: theme.spacing.md,
  },
  shindigSocialFooter: {
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
  },
  feedCard: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: 'transparent',
    borderRadius: theme.radius.xl,
    borderWidth: 2,
    overflow: 'hidden',
    padding: theme.spacing.md,
  },
  feedCardHighlighted: {
    borderColor: theme.colors.accentPink,
    borderWidth: 2,
  },
  feedCardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  feedCardHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginTop: 2,
  },
  feedCardHeaderMain: {
    flex: 1,
    minWidth: 0,
  },
  feedAuthor: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  feedAuthorTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minWidth: 0,
  },
  feedTime: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  feedPhoto: {
    height: '100%',
    width: '100%',
  },
  feedPhotoFrame: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: theme.radius.lg,
    height: 320,
    overflow: 'hidden',
  },
  feedPhotoPressable: {
    marginTop: theme.spacing.sm,
  },
  photoCreditBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 79, 160, 0.16)',
    borderColor: 'rgba(255, 79, 160, 0.34)',
    borderRadius: theme.radius.round,
    borderWidth: 1,
    marginTop: 6,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  photoCredit: {
    color: theme.colors.accentSoft,
    fontSize: 12,
    fontWeight: '700',
  },
  coverPhotoBadge: {
    backgroundColor: 'rgba(255, 138, 91, 0.2)',
    borderRadius: theme.radius.round,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  coverPhotoBadgeText: {
    color: '#FFB693',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  photoMenuButton: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  socialRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  socialButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.round,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  socialStat: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  socialButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  socialMeta: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  photoViewerBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(4, 8, 18, 0.86)',
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  photoViewerDismissArea: {
    ...StyleSheet.absoluteFillObject,
  },
  photoViewerCard: {
    alignSelf: 'stretch',
    maxHeight: '82%',
    position: 'relative',
  },
  photoViewerCloseButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(8, 11, 22, 0.72)',
    borderRadius: theme.radius.round,
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    right: theme.spacing.sm,
    top: theme.spacing.sm,
    width: 36,
    zIndex: 2,
  },
  photoViewerFrame: {
    backgroundColor: '#050914',
    borderColor: theme.colors.borderStrong,
    borderRadius: 24,
    borderWidth: 1,
    height: 520,
    maxHeight: '100%',
    overflow: 'hidden',
    width: '100%',
  },
  photoViewerImage: {
    height: '100%',
    width: '100%',
  },
  likeSheetBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(4, 8, 18, 0.72)',
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  likeSheetDismissArea: {
    ...StyleSheet.absoluteFillObject,
  },
  likeSheetCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderStrong,
    borderRadius: 24,
    borderWidth: 1,
    maxHeight: '70%',
    padding: theme.spacing.lg,
    width: '100%',
  },
  likeSheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  likeSheetTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  likeSheetCloseButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.round,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  likeSheetList: {
    gap: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  likeSheetRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  likeSheetAvatar: {
    borderRadius: theme.radius.round,
    height: 44,
    width: 44,
  },
  likeSheetCopy: {
    flex: 1,
    marginLeft: theme.spacing.sm,
    minWidth: 0,
  },
  likeSheetName: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  likeSheetHandle: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 3,
  },
  likeSheetEmpty: {
    color: theme.colors.textMuted,
    fontSize: 14,
    paddingVertical: theme.spacing.lg,
    textAlign: 'center',
  },
  requestPhotoButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  requestPhotoButtonDisabled: {
    opacity: 0.7,
  },
  requestPhotoButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  requestPhotoWrap: {
    marginTop: theme.spacing.md,
  },
  requestPromptCard: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    marginTop: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  requestPromptTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  requestPromptText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: theme.spacing.xs,
  },
  requestPromptActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  requestPromptButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flex: 1,
    paddingVertical: theme.spacing.sm,
  },
  requestPromptButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  upcomingScreenContent: {
    paddingBottom: theme.spacing.xxxl,
    paddingHorizontal: theme.spacing.xs,
  },
  upcomingHeroCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    marginTop: theme.spacing.md,
    minHeight: 280,
    overflow: 'hidden',
  },
  upcomingHeroImage: {
    height: '100%',
    left: 0,
    position: 'absolute',
    top: 0,
    width: '100%',
  },
  upcomingHeroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9, 14, 28, 0.26)',
  },
  upcomingHeroContent: {
    justifyContent: 'flex-end',
    minHeight: 280,
    padding: theme.spacing.lg,
  },
  upcomingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 79, 160, 0.18)',
    borderColor: 'rgba(255, 79, 160, 0.32)',
    borderRadius: theme.radius.round,
    borderWidth: 1,
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  upcomingBadgeText: {
    color: '#FFD2EB',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  upcomingHeroTitle: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  upcomingHeroMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: theme.spacing.sm,
  },
  upcomingHeroMetaText: {
    color: '#F6ECFF',
    fontSize: 14,
    fontWeight: '600',
  },
  upcomingHeroMetaDot: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    fontWeight: '700',
  },
  upcomingHeroStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  upcomingHeroStat: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  upcomingHeroStatText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  upcomingHeroActionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  upcomingPillButtonSecondary: {
    alignItems: 'center',
    backgroundColor: 'rgba(13, 19, 37, 0.64)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: theme.radius.round,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  upcomingPillButtonSecondaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  upcomingPillButtonPrimary: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentPink,
    borderRadius: theme.radius.round,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  upcomingPillButtonPrimaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  upcomingHostPill: {
    backgroundColor: 'rgba(13, 19, 37, 0.64)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: theme.radius.round,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  upcomingHostPillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  upcomingQuickActionsRow: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  upcomingQuickAction: {
    alignItems: 'center',
    flex: 1,
    gap: theme.spacing.sm,
  },
  upcomingQuickActionIconWrap: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  upcomingQuickActionPink: {
    backgroundColor: '#F04F8F',
  },
  upcomingQuickActionPurple: {
    backgroundColor: '#AA68FF',
  },
  upcomingQuickActionBlue: {
    backgroundColor: '#5D95FF',
  },
  upcomingQuickActionGreen: {
    backgroundColor: '#7CC85B',
  },
  upcomingQuickActionText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    textAlign: 'center',
  },
  upcomingDashboardGrid: {
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  upcomingDashboardSide: {
    gap: theme.spacing.md,
  },
  upcomingPanelCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    padding: theme.spacing.md,
  },
  upcomingPanelWide: {
    width: '100%',
  },
  upcomingPanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  upcomingPanelHeaderLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  upcomingPanelTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  upcomingPanelActionText: {
    color: theme.colors.textMuted,
    flexShrink: 1,
    fontSize: 11,
    textAlign: 'right',
  },
  upcomingPanelActionLink: {
    color: theme.colors.accentPink,
    fontSize: 12,
    fontWeight: '700',
  },
  upcomingPanelFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginTop: theme.spacing.md,
  },
  upcomingPanelFooterText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  bringListItemsCompact: {
    gap: theme.spacing.sm,
  },
  bringListItemCard: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 12,
  },
  bringListItemTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  bringListItemLead: {
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  bringListEmoji: {
    fontSize: 20,
  },
  upcomingMiniAvatarRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  upcomingMiniAvatar: {
    borderColor: theme.colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    height: 20,
    width: 20,
  },
  upcomingEmptyMiniText: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },
  upcomingAttendeeGroup: {
    marginTop: theme.spacing.sm,
  },
  upcomingAttendeeGroupLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: theme.spacing.sm,
  },
  upcomingAttendeeAvatarRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  upcomingAttendeeAvatar: {
    borderColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    height: 28,
    width: 28,
  },
  upcomingAttendeeOverflow: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  upcomingAttendeeOverflowText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  upcomingActivityList: {
    gap: theme.spacing.sm,
  },
  upcomingActivityItem: {
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    paddingBottom: theme.spacing.sm,
  },
  upcomingActivityLead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  upcomingActivityIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  upcomingActivityThumb: {
    borderRadius: theme.radius.md,
    height: 38,
    width: 38,
  },
  upcomingActivityCopy: {
    flex: 1,
  },
  upcomingActivityTitle: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  upcomingActivityTime: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  upcomingMemoriesAction: {
    paddingVertical: 2,
  },
  upcomingMemoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  upcomingMemoryTile: {
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    width: '31%',
  },
  upcomingMemoryImage: {
    aspectRatio: 1,
    width: '100%',
  },
  upcomingMemoriesEmpty: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    minHeight: 120,
    justifyContent: 'center',
    padding: theme.spacing.md,
    width: '100%',
  },
  upcomingMemoriesFooter: {
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  upcomingPanelFooterLink: {
    color: theme.colors.accentPink,
    fontSize: 12,
    fontWeight: '700',
  },
  upcomingBottomCta: {
    alignItems: 'center',
    backgroundColor: '#F36A77',
    borderRadius: theme.radius.xl,
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  upcomingBottomCtaCopy: {
    flex: 1,
  },
  upcomingBottomCtaTitle: {
    color: '#FFF5F7',
    fontSize: 18,
    fontWeight: '900',
  },
  upcomingBottomCtaText: {
    color: '#FFE3EA',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  upcomingBottomCtaButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: theme.radius.round,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  upcomingBottomCtaButtonText: {
    color: theme.colors.accentPurple,
    fontSize: 13,
    fontWeight: '800',
  },
  bringListCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    marginTop: theme.spacing.lg,
    padding: theme.spacing.lg,
  },
  bringListHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bringListHeaderCopy: {
    flex: 1,
    paddingRight: theme.spacing.md,
  },
  bringListTitle: {
    color: theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  bringListSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 4,
  },
  bringListCountBadge: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 34,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  bringListCountText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  bringListComposer: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  bringListInput: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    color: theme.colors.textPrimary,
    flex: 1,
    minHeight: 48,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  bringListAddButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentPink,
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 72,
    paddingHorizontal: theme.spacing.md,
  },
  bringListAddButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  bringListItems: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  bringListItemRow: {
    alignItems: 'flex-start',
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 12,
  },
  bringListItemCopy: {
    flex: 1,
  },
  bringListItemLabel: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  bringListItemMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  bringListClaimButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 92,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
  },
  bringListClaimButtonPrimary: {
    backgroundColor: theme.colors.accentPink,
    borderColor: theme.colors.accentPink,
  },
  bringListClaimButtonDisabled: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  bringListClaimButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  bringListClaimButtonTextPrimary: {
    color: '#FFFFFF',
  },
  bringListClaimButtonTextDisabled: {
    color: theme.colors.textMuted,
  },
  bringListDeleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  bringListEmptyText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: theme.spacing.md,
  },
  customBringSection: {
    marginTop: theme.spacing.lg,
  },
  customBringTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  customBringSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 4,
  },
  commentComposer: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  commentInput: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    color: theme.colors.textPrimary,
    flex: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  commentButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentPink,
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  commentButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  commentList: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  commentItem: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    padding: theme.spacing.sm,
  },
  commentHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  commentHeaderCopy: {
    flex: 1,
  },
  commentAuthor: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  commentTimestamp: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  commentDelete: {
    color: '#FF9F8A',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: theme.spacing.sm,
  },
  commentBody: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 4,
  },
});

