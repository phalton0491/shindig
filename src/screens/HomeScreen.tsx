import { useEffect, useMemo, useRef, useState } from 'react';
import * as Contacts from 'expo-contacts';
import * as FileSystem from 'expo-file-system/legacy';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
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
import { listShindigChatMessages, sendShindigChatMessage } from '../lib/chats';
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
  ShindigChatMessage,
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
  initialPlannedFeedViewMode?: 'feed' | 'overview' | null;
  initialStep?: 'create' | 'welcome' | null;
  onAcceptUpcomingInvite?: (inviteId: string) => Promise<void>;
  onFlowStepChange?: (step: FlowStep) => void;
  onConsumeInitialFeedShindig?: () => void;
  onConsumeInitialHighlightedPhotoId?: () => void;
  onConsumeInitialPlannedFeedViewMode?: () => void;
  onConsumeInitialStep?: () => void;
  onMaybeUpcomingInvite?: (inviteId: string) => Promise<void>;
  onOpenShindigChat?: (shindigId: string) => void;
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
  onViewStateChange?: (state: {
    activeFeedShindig: SavedShindig | null;
    plannedFeedViewMode: 'feed' | 'overview';
    step: FlowStep;
  }) => void;
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

function buildShareInviteMessage(args: {
  inviteMessage?: string;
  inviteUrl: string;
  inviterName: string;
  plannedFor: string;
  title: string;
}) {
  const optionalMessage = args.inviteMessage?.trim();

  return `${args.inviterName} invited you to the planned ShinDig "${args.title}" on ${formatPlannedDateLabel(
    args.plannedFor
  )}.${optionalMessage ? ` Message: ${optionalMessage}` : ''} If you are new, sign up first. If you already have ShinDig, open this link to review the invite: ${args.inviteUrl}`;
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
  initialPlannedFeedViewMode,
  initialStep,
  onAcceptUpcomingInvite,
  onFlowStepChange,
  onConsumeInitialFeedShindig,
  onConsumeInitialHighlightedPhotoId,
  onConsumeInitialPlannedFeedViewMode,
  onConsumeInitialStep,
  onMaybeUpcomingInvite,
  onOpenShindigChat,
  onRejectUpcomingInvite,
  onShindigSaved,
  onShindigDeleted,
  onShindigCoverPhotoChanged,
  onShindigPhotoDeleted,
  onShindigStateChanged,
  onViewStateChange,
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
  const [inviteMessageDraft, setInviteMessageDraft] = useState('');
  const [selectedContactsById, setSelectedContactsById] = useState<Record<string, InviteContact>>(
    {}
  );
  const [inviteSearch, setInviteSearch] = useState('');
  const [isInvitePickerOpen, setIsInvitePickerOpen] = useState(false);
  const [isSearchingInviteUsers, setIsSearchingInviteUsers] = useState(false);
  const [activeFeedShindig, setActiveFeedShindig] = useState<SavedShindig | null>(null);
  const [error, setError] = useState('');
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
  const [initialBringItemDraft, setInitialBringItemDraft] = useState('');
  const [initialBringItems, setInitialBringItems] = useState<string[]>([]);
  const [bringItemDraft, setBringItemDraft] = useState('');
  const [customBringItemDraft, setCustomBringItemDraft] = useState('');
  const [actingBringItemId, setActingBringItemId] = useState('');
  const [showAllUpcomingBringItems, setShowAllUpcomingBringItems] = useState(false);
  const [plannedFeedViewMode, setPlannedFeedViewMode] = useState<'feed' | 'overview'>('overview');
  const [activeUpcomingOverviewTab, setActiveUpcomingOverviewTab] = useState<
    'overview' | 'chat' | 'items' | 'photos' | 'invite'
  >('overview');
  const [upcomingChatMessages, setUpcomingChatMessages] = useState<ShindigChatMessage[]>([]);
  const [inviteFlowMode, setInviteFlowMode] = useState<'create' | 'existing'>('create');
  const [showCreateInviteContacts, setShowCreateInviteContacts] = useState(false);
  const [expandedWelcomeSection, setExpandedWelcomeSection] = useState<
    'active' | 'completed' | 'upcoming' | null
  >(null);
  const [isLikeSheetVisible, setIsLikeSheetVisible] = useState(false);
  const [isLoadingLikeSheet, setIsLoadingLikeSheet] = useState(false);
  const [likeSheetProfiles, setLikeSheetProfiles] = useState<FriendProfile[]>([]);
  const [likeSheetTitle, setLikeSheetTitle] = useState('Liked by');
  const [actingInviteActionKey, setActingInviteActionKey] = useState('');
  const feedScrollRef = useRef<ScrollView | null>(null);
  const createFlowScrollRef = useRef<ScrollView | null>(null);
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
  const selectedAppInviteCount = selectedFriends.length + selectedInviteUsers.length;
  const selectedInviteTotal = selectedContacts.length + selectedAppInviteCount;
  const unselectedFriends = useMemo(
    () => filteredFriends.filter((friend) => !selectedFriendIds.includes(friend.id)),
    [filteredFriends, selectedFriendIds]
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
  const acceptedInviteeIds = useMemo(
    () =>
      new Set(
        activeFeedShindig?.inviteParticipants
          .filter((participant) => participant.status === 'accepted')
          .map((participant) => participant.profile.id) || []
      ),
    [activeFeedShindig]
  );

  useEffect(() => {
    onFlowStepChange?.(step);
  }, [onFlowStepChange, step]);

  useEffect(() => {
    onViewStateChange?.({
      activeFeedShindig,
      plannedFeedViewMode,
      step,
    });
  }, [activeFeedShindig, onViewStateChange, plannedFeedViewMode, step]);

  useEffect(() => {
    if (!initialFeedShindig) {
      return;
    }

    setError('');
    setPlannedFeedViewMode(initialPlannedFeedViewMode || 'overview');
    setActiveFeedShindig(initialFeedShindig);
    setFeedBackMode('external');
    setStep('feed');
    onConsumeInitialFeedShindig?.();
    onConsumeInitialPlannedFeedViewMode?.();
  }, [
    initialFeedShindig,
    initialPlannedFeedViewMode,
    onConsumeInitialFeedShindig,
    onConsumeInitialPlannedFeedViewMode,
  ]);

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
    const searchQuery = locationQuery.trim();

    async function runLocationSearch() {
      if (searchQuery.length < 2) {
        setLocationResults([]);
        return;
      }

      setIsSearchingLocations(true);
      try {
        const results = await searchPlaces({
          mode: 'instant',
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
  }, [locationQuery]);

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
    setLocationQuery(place.address || place.title);
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
    setInviteMessageDraft('');
    setInviteSearch('');
    setInviteSearchResults([]);
    setShowCreateInviteContacts(false);
    setInitialBringItemDraft('');
    setInitialBringItems([]);
    setBringItemDraft('');
    setCustomBringItemDraft('');
    setShowAllUpcomingBringItems(false);
    setPlannedFeedViewMode('overview');
    setActiveUpcomingOverviewTab('overview');
    setExpandedWelcomeSection(null);
    setIsInvitePickerOpen(false);
    setContacts([]);
    setActiveFeedShindig(null);
    setFeedBackMode('welcome');
    setStep('create');
    createFlowScrollRef.current?.scrollTo({ animated: false, x: 0, y: 0 });
  }

  function scrollCreateFlowToTop() {
    createFlowScrollRef.current?.scrollTo({
      animated: true,
      x: 0,
      y: 0,
    });
  }

  function openPastShindig(shindig: SavedShindig) {
    setError('');
    setBringItemDraft('');
    setCustomBringItemDraft('');
    setShowAllUpcomingBringItems(false);
    setPlannedFeedViewMode('overview');
    setActiveUpcomingOverviewTab('overview');
    setExpandedWelcomeSection(null);
    setActiveFeedShindig(shindig);
    setFeedBackMode('welcome');
    setStep('feed');
  }

  function handleAddInitialBringItem() {
    const nextLabel = initialBringItemDraft.trim();
    if (!nextLabel) {
      return;
    }

    setInitialBringItems((current) =>
      current.includes(nextLabel) ? current : [...current, nextLabel]
    );
    setInitialBringItemDraft('');
  }

  function handleRemoveInitialBringItem(label: string) {
    setInitialBringItems((current) => current.filter((item) => item !== label));
  }

  function handleAddSuggestedBringItem(label: string) {
    setInitialBringItems((current) => (current.includes(label) ? current : [...current, label]));
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

  async function refreshUpcomingChatMessages(shindigId: string) {
    try {
      const nextMessages = await listShindigChatMessages({
        shindigId,
        userId,
      });
      setUpcomingChatMessages(nextMessages);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Could not load this ShinDig chat.'
      );
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
      setUpcomingChatMessages([]);
      return;
    }

    void refreshUpcomingChatMessages(activeFeedShindig.id);
  }, [activeFeedShindig?.id, activeFeedShindig?.state, step, userId]);

  useEffect(() => {
    if (!supabase || step !== 'feed' || !activeFeedShindig || activeFeedShindig.state !== 'planned') {
      return;
    }

    const client = supabase;
    const channel = client
      .channel(`planned-shindig-chat-preview:${activeFeedShindig.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          filter: `shindig_id=eq.${activeFeedShindig.id}`,
          schema: 'public',
          table: 'shindig_chat_messages',
        },
        () => {
          void refreshUpcomingChatMessages(activeFeedShindig.id);
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [activeFeedShindig?.id, activeFeedShindig?.state, step, userId]);

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
      scrollCreateFlowToTop();
      return;
    }

    if (photos.length === 0) {
      setError('Add at least one photo before continuing.');
      scrollCreateFlowToTop();
      return;
    }

    if (photos.length > 1) {
      setError('Upcoming ShinDigs can only start with one cover photo.');
      scrollCreateFlowToTop();
      return;
    }

    if (!locationQuery.trim()) {
      setError('Choose a starting location before continuing.');
      scrollCreateFlowToTop();
      return;
    }

    if (plannedFor.getTime() <= Date.now()) {
      setError('Pick a future date and time for this planned ShinDig.');
      scrollCreateFlowToTop();
      return;
    }

    setError('');

    setInviteSearch('');
    setIsInvitePickerOpen(true);
    setContacts([]);
    setShowCreateInviteContacts(false);
    setInviteFlowMode('create');
    setStep('invite');
    await loadDeviceContacts({ reset: true });
  }

  async function openInvitePicker() {
    setError('');
    setInviteSearch('');
    setInviteSearchResults([]);
    setIsInvitePickerOpen(true);
    await loadDeviceContacts({ reset: true });
  }

  function resetInviteSelections() {
    setInviteMessageDraft('');
    setSelectedContactsById({});
    setSelectedFriendIds([]);
    setSelectedInviteUsersById({});
    setInviteSearch('');
    setInviteSearchResults([]);
    setShowCreateInviteContacts(false);
  }

  async function startInviteMorePeopleFlow() {
    if (!activeFeedShindig || activeFeedShindig.ownerId !== userId) {
      return;
    }

    setError('');
    resetInviteSelections();
    setContacts([]);
    setInviteFlowMode('existing');
    setStep('invite');
    setIsInvitePickerOpen(true);
    await loadDeviceContacts({ reset: true });
  }

  function closeInvitePicker() {
    contactsRequestIdRef.current += 1;
    setIsLoadingContacts(false);
    setInviteSearch('');
    setInviteSearchResults([]);
    setIsInvitePickerOpen(false);

    if (inviteFlowMode === 'existing') {
      setStep('feed');
    }
  }

  function skipInvites() {
    if (inviteFlowMode === 'existing') {
      closeInvitePicker();
      return;
    }

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
        scrollCreateFlowToTop();
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
        scrollCreateFlowToTop();
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

  async function saveShindigAndOpenFeed(options?: { shareAfterSave?: boolean }) {
      const startingPlace = selectedLocation || (locationQuery.trim() ? buildManualPlace(locationQuery) : null);

    if (!startingPlace) {
      setError('Choose a starting location first.');
      scrollCreateFlowToTop();
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

      if (initialBringItems.length > 0) {
        await Promise.all(
          initialBringItems.map((label) =>
            addBringItem({
              label,
              shindigId: savedShindigWithCover.id,
              userId,
            })
          )
        );
      }

      const inviteIssues: string[] = [];
      const selectedAppInvitees = [
        ...selectedFriends,
        ...selectedInviteUsers.filter(
          (candidate) => !selectedFriendIds.includes(candidate.id)
        ),
      ];
      const inviteMessage = inviteMessageDraft.trim();

      if (inviteMessage) {
        await sendShindigChatMessage({
          body: inviteMessage,
          shindigId: savedShindigWithCover.id,
          userId,
        });
      }

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
                    `${profile.name} invited you to the planned ShinDig "${savedShindigWithCover.title}" on ${formatPlannedDateLabel(
                      plannedFor.toISOString()
                    )}.${inviteMessage ? ` Message: ${inviteMessage}` : ''}`,
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
            buildShareInviteMessage({
              inviteMessage,
              inviteUrl,
              inviterName: profile.name,
              plannedFor: plannedFor.toISOString(),
              title: savedShindigWithCover.title,
            })
          );
        } catch (nextError) {
          inviteIssues.push(
            nextError instanceof Error
              ? nextError.message
              : 'The text-message invites could not be sent.'
          );
        }
      }

      if (options?.shareAfterSave) {
        try {
          const invite = await createPhoneShindigInvite({
            inviterUserId: userId,
            shindigId: savedShindigWithCover.id,
          });
          if (!invite.invite_token) {
            throw new Error('The share invite link could not be created.');
          }

          const inviteUrl = `${INVITE_LINK_BASE}?invite=${encodeURIComponent(
            invite.invite_token
          )}`;

          await Share.share({
            message: buildShareInviteMessage({
              inviteMessage,
              inviteUrl,
              inviterName: profile.name,
              plannedFor: plannedFor.toISOString(),
              title: savedShindigWithCover.title,
            }),
            title: savedShindigWithCover.title,
          });
        } catch (nextError) {
          inviteIssues.push(
            nextError instanceof Error ? nextError.message : 'The invite could not be shared.'
          );
        }
      }

      setActiveFeedShindig(savedShindigWithCover);
      setStep('feed');
      if (inviteIssues.length > 0) {
        setError(inviteIssues.join(' '));
        scrollCreateFlowToTop();
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to start this ShinDig.'
      );
      scrollCreateFlowToTop();
    } finally {
      setIsSavingShindig(false);
    }
  }

  async function handleInviteMorePeople() {
    if (!activeFeedShindig || activeFeedShindig.ownerId !== userId) {
      return;
    }

    const targetShindig = activeFeedShindig;
    const selectedAppInvitees = [
      ...selectedFriends,
      ...selectedInviteUsers.filter((candidate) => !selectedFriendIds.includes(candidate.id)),
    ];

    if (selectedAppInvitees.length + selectedContacts.length === 0) {
      setError('Select at least one person to invite.');
      return;
    }

    setIsSavingShindig(true);
    setError('');

    try {
      const inviteIssues: string[] = [];

      if (selectedAppInvitees.length > 0) {
        try {
          const invites = await createAppFriendShindigInvites({
            friendIds: selectedAppInvitees.map((friend) => friend.id),
            inviterUserId: userId,
            shindigId: targetShindig.id,
          });

          await Promise.all(
            invites
              .filter((invite) => invite.status === 'pending' && invite.invitee_user_id)
              .map((invite) =>
                createNotification({
                  actorUserId: userId,
                  inviteId: invite.id,
                  message:
                    `${profile.name} invited you to the planned ShinDig "${targetShindig.title}" on ${formatPlannedDateLabel(
                      targetShindig.plannedFor || new Date().toISOString()
                    )}.`,
                  recipientUserId: invite.invitee_user_id!,
                  shindigId: targetShindig.id,
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
            shindigId: targetShindig.id,
          });
          if (!invite.invite_token) {
            throw new Error('The text-message invite link could not be created.');
          }
          const inviteUrl = `${INVITE_LINK_BASE}?invite=${encodeURIComponent(
            invite.invite_token
          )}`;

          await SMS.sendSMSAsync(
            selectedContacts.map((contact) => contact.phoneNumber),
            `${profile.name} invited you to the planned ShinDig "${targetShindig.title}" on ${formatPlannedDateLabel(
              targetShindig.plannedFor || new Date().toISOString()
            )}. If you are new, sign up first. If you already have ShinDig, open this link to review the invite: ${inviteUrl}`
          );
        } catch (nextError) {
          inviteIssues.push(
            nextError instanceof Error
              ? nextError.message
              : 'The text-message invites could not be sent.'
          );
        }
      }

      await refreshActiveFeed(targetShindig.id);
      resetInviteSelections();
      setContacts([]);
      setInviteFlowMode('create');
      setIsInvitePickerOpen(false);
      setStep('feed');

      if (inviteIssues.length > 0) {
        setError(inviteIssues.join(' '));
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to send these invites.'
      );
    } finally {
      setIsSavingShindig(false);
    }
  }

  async function handleImmediateInvite(args: {
    actionKey: string;
    contacts?: InviteContact[];
    inviteUsers?: FriendProfile[];
  }) {
    if (!activeFeedShindig || activeFeedShindig.ownerId !== userId) {
      return;
    }

    const targetShindig = activeFeedShindig;
    const inviteUsers = args.inviteUsers || [];
    const contactsToInvite = args.contacts || [];

    if (inviteUsers.length + contactsToInvite.length === 0) {
      return;
    }

    setActingInviteActionKey(args.actionKey);
    setError('');

    try {
      const inviteIssues: string[] = [];

      if (inviteUsers.length > 0) {
        try {
          const invites = await createAppFriendShindigInvites({
            friendIds: inviteUsers.map((friend) => friend.id),
            inviterUserId: userId,
            shindigId: targetShindig.id,
          });

          await Promise.all(
            invites
              .filter((invite) => invite.status === 'pending' && invite.invitee_user_id)
              .map((invite) =>
                createNotification({
                  actorUserId: userId,
                  inviteId: invite.id,
                  message:
                    `${profile.name} invited you to the planned ShinDig "${targetShindig.title}" on ${formatPlannedDateLabel(
                      targetShindig.plannedFor || new Date().toISOString()
                    )}.`,
                  recipientUserId: invite.invitee_user_id!,
                  shindigId: targetShindig.id,
                  type: 'shindig_invite',
                })
              )
          );

          setSelectedFriendIds((current) =>
            Array.from(
              new Set([
                ...current,
                ...inviteUsers
                  .filter((candidate) => friends.some((friend) => friend.id === candidate.id))
                  .map((candidate) => candidate.id),
              ])
            )
          );
          setSelectedInviteUsersById((current) => ({
            ...current,
            ...Object.fromEntries(
              inviteUsers
                .filter((candidate) => !friends.some((friend) => friend.id === candidate.id))
                .map((candidate) => [candidate.id, candidate])
            ),
          }));
        } catch (nextError) {
          inviteIssues.push(
            nextError instanceof Error
              ? nextError.message
              : 'Some in-app friend invites could not be sent.'
          );
        }
      }

      if (contactsToInvite.length > 0) {
        try {
          const smsAvailable = await SMS.isAvailableAsync();
          if (!smsAvailable) {
            throw new Error('Text-message invites are only available on your phone.');
          }

          const invite = await createPhoneShindigInvite({
            inviterUserId: userId,
            shindigId: targetShindig.id,
          });
          if (!invite.invite_token) {
            throw new Error('The text-message invite link could not be created.');
          }
          const inviteUrl = `${INVITE_LINK_BASE}?invite=${encodeURIComponent(
            invite.invite_token
          )}`;

          await SMS.sendSMSAsync(
            contactsToInvite.map((contact) => contact.phoneNumber),
            `${profile.name} invited you to the planned ShinDig "${targetShindig.title}" on ${formatPlannedDateLabel(
              targetShindig.plannedFor || new Date().toISOString()
            )}. If you are new, sign up first. If you already have ShinDig, open this link to review the invite: ${inviteUrl}`
          );

          setSelectedContactsById((current) => ({
            ...current,
            ...Object.fromEntries(contactsToInvite.map((contact) => [contact.id, contact])),
          }));
        } catch (nextError) {
          inviteIssues.push(
            nextError instanceof Error
              ? nextError.message
              : 'The text-message invites could not be sent.'
          );
        }
      }

      await refreshActiveFeed(targetShindig.id);

      if (inviteIssues.length > 0) {
        setError(inviteIssues.join(' '));
        scrollCreateFlowToTop();
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to send this invite.'
      );
      scrollCreateFlowToTop();
    } finally {
      setActingInviteActionKey('');
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

  async function handleSendUpcomingChatMessage() {
    if (!activeFeedShindig || !shindigCommentDraft.trim()) {
      return;
    }

    const targetShindig = activeFeedShindig;
    const nextBody = shindigCommentDraft.trim();
    const optimisticMessage = {
      author: buildCurrentUserProfile(profile, userId),
      body: nextBody,
      createdAt: new Date().toISOString(),
      id: `local-shindig-chat-${Date.now()}`,
      shindigId: targetShindig.id,
    } satisfies ShindigChatMessage;

    setUpcomingChatMessages((current) => [...current, optimisticMessage]);
    setShindigCommentDraft('');

    try {
      await sendShindigChatMessage({
        body: nextBody,
        shindigId: targetShindig.id,
        userId,
      });
      const recipientIds = Array.from(
        new Set([
          targetShindig.ownerId,
          ...targetShindig.inviteParticipants
            .filter((participant) => participant.status === 'accepted')
            .map((participant) => participant.profile.id),
        ])
      ).filter((recipientUserId) => recipientUserId !== userId);

      if (recipientIds.length > 0) {
        await Promise.all(
          recipientIds.map((recipientUserId) =>
            createNotification({
              actorUserId: userId,
              message: `New chat message in "${targetShindig.title}".`,
              recipientUserId,
              shindigId: targetShindig.id,
              type: 'shindig_chat_message',
            })
          )
        );
      }

      await refreshUpcomingChatMessages(targetShindig.id);
    } catch (nextError) {
      setUpcomingChatMessages((current) =>
        current.filter((message) => message.id !== optimisticMessage.id)
      );
      setShindigCommentDraft(nextBody);
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to send that chat message.'
      );
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
    void startInviteMorePeopleFlow();
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

  async function openNavigationAddressPrompt(address: string) {
    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
      return;
    }

    const encodedAddress = encodeURIComponent(trimmedAddress);
    const appleMapsUrl = `http://maps.apple.com/?q=${encodedAddress}`;
    const googleMapsAppUrl = `comgooglemaps://?q=${encodedAddress}`;
    const googleMapsWebUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;

    const shareAddress = () => {
      void Share.share({
        message: trimmedAddress,
        title: 'Address',
      });
    };

    const openAppleMaps = () => {
      void Linking.openURL(appleMapsUrl);
    };

    const openGoogleMaps = async () => {
      const canOpenGoogleMapsApp = await Linking.canOpenURL(googleMapsAppUrl);
      await Linking.openURL(canOpenGoogleMapsApp ? googleMapsAppUrl : googleMapsWebUrl);
    };

    if (Platform.OS === 'ios') {
      const canOpenGoogleMapsApp = await Linking.canOpenURL(googleMapsAppUrl);
      const options = [
        'Copy Address',
        'Open in Apple Maps',
        ...(canOpenGoogleMapsApp ? ['Open in Google Maps'] : []),
        'Cancel',
      ];

      ActionSheetIOS.showActionSheetWithOptions(
        {
          cancelButtonIndex: options.length - 1,
          options,
          title: trimmedAddress,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            shareAddress();
          }
          if (buttonIndex === 1) {
            openAppleMaps();
          }
          if (canOpenGoogleMapsApp && buttonIndex === 2) {
            void openGoogleMaps();
          }
        }
      );
      return;
    }

    Alert.alert(trimmedAddress, 'Choose what you want to do with this address.', [
      {
        onPress: shareAddress,
        text: 'Copy Address',
      },
      {
        onPress: openAppleMaps,
        text: 'Open in Maps',
      },
      {
        onPress: () => {
          void openGoogleMaps();
        },
        text: 'Open in Google Maps',
      },
      {
        style: 'cancel',
        text: 'Cancel',
      },
    ]);
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

  function scrollToUpcomingSection(key: 'activity' | 'bring' | 'memories' | 'chat' | 'photos') {
    const normalizedKey = key === 'photos' ? 'memories' : key;
    setActiveUpcomingOverviewTab(
      key === 'bring' ? 'items' : key === 'photos' ? 'photos' : key === 'chat' ? 'chat' : 'overview'
    );
    const y = sectionOffsetsRef.current[normalizedKey];
    if (typeof y !== 'number') {
      return;
    }

    feedScrollRef.current?.scrollTo({
      animated: true,
      y: Math.max(y - 120, 0),
    });
  }

  function scrollUpcomingOverviewToTop() {
    setActiveUpcomingOverviewTab('overview');
    feedScrollRef.current?.scrollTo({
      animated: true,
      y: 0,
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
    const displayedUpcomingShindigs =
      expandedWelcomeSection === 'upcoming' ? plannedShindigs : plannedShindigs.slice(0, 1);
    const displayedActiveShindigs =
      expandedWelcomeSection === 'active' ? activeShindigs : activeShindigs.slice(0, 1);
    const displayedCompletedShindigs =
      expandedWelcomeSection === 'completed'
        ? completedShindigs
        : completedShindigs.slice(0, 1);

    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.shindigsWelcomeContent} showsVerticalScrollIndicator={false}>
          <View style={styles.shindigsWelcomeHeader}>
            <View style={styles.shindigsWelcomeCopy}>
              <Text style={styles.shindigsWelcomeTitle}>Hey {profile.name.split(' ')[0]} {'\u{1F44B}'}</Text>
              <Text style={styles.shindigsWelcomeSubtitle}>
                What shindig are we creating today?
              </Text>
            </View>
            <View style={styles.shindigsWelcomeActions}>{headerActions}</View>
          </View>

          <Pressable onPress={goToCreate} style={styles.shindigsWelcomePrimaryCta}>
            <Ionicons color="#FFFFFF" name="add-circle-outline" size={28} />
            <Text style={styles.shindigsWelcomePrimaryCtaText}>Start a Shindig</Text>
          </Pressable>

          <View style={styles.shindigsWelcomeSectionHeader}>
            <View style={styles.shindigsWelcomeSectionTitleWrap}>
              <Ionicons color={theme.colors.accentPink} name="calendar-outline" size={22} />
              <Text style={styles.shindigsWelcomeSectionTitle}>Upcoming Shindigs</Text>
            </View>
            <Pressable
              onPress={() =>
                setExpandedWelcomeSection((current) => (current === 'upcoming' ? null : 'upcoming'))
              }
              style={styles.shindigsWelcomeSeeAll}
            >
              <Text style={styles.shindigsWelcomeSeeAllText}>See all</Text>
              <Ionicons color={theme.colors.accentPink} name="chevron-forward" size={18} />
            </Pressable>
          </View>
          {plannedShindigs.length > 0 ? (
            <View style={styles.shindigsWelcomeCardList}>
              {displayedUpcomingShindigs.map((shindig) => (
                <Pressable
                  key={shindig.id}
                  onPress={() => openPastShindig(shindig)}
                  style={styles.shindigsWelcomeUpcomingCard}
                >
                  <Image
                    source={{
                      uri:
                        shindig.coverPhotoThumbnailUrl ||
                        shindig.coverPhotoUrl ||
                        'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1200&q=80',
                    }}
                    style={styles.shindigsWelcomeUpcomingImage}
                  />
                  <View style={styles.shindigsWelcomeUpcomingCopy}>
                    <View style={styles.shindigsWelcomeMetaRow}>
                      <Ionicons color={theme.colors.accentPink} name="calendar-outline" size={17} />
                      <Text style={styles.shindigsWelcomeMetaText}>
                        {shindig.plannedFor
                          ? formatPlannedDateLabel(shindig.plannedFor)
                          : formatDateLabel(shindig.createdAt)}
                      </Text>
                    </View>
                    <Text style={styles.shindigsWelcomeUpcomingTitle}>{shindig.title}</Text>
                    <View style={styles.shindigsWelcomeMetaRow}>
                      <Ionicons color={theme.colors.accentPink} name="location-outline" size={17} />
                      <Text style={styles.shindigsWelcomeMetaText}>
                        {shindig.stops[0]?.place.address ||
                          shindig.stops[0]?.place.title ||
                          'Location coming soon'}
                      </Text>
                    </View>
                  </View>
                  <Ionicons color={theme.colors.accentPink} name="chevron-forward" size={28} />
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.shindigsWelcomeEmptyCard}>
              <View style={styles.shindigsWelcomeEmptyIconWrap}>
                <Ionicons color="#9D7CFF" name="sparkles-outline" size={38} />
              </View>
              <View style={styles.shindigsWelcomeEmptyCopy}>
                <Text style={styles.shindigsWelcomeEmptyTitle}>No upcoming Shindigs</Text>
                <Text style={styles.shindigsWelcomeEmptyText}>
                  Your upcoming shindigs will appear here.
                </Text>
              </View>
            </View>
          )}

          <View style={styles.shindigsWelcomeSectionHeader}>
            <View style={styles.shindigsWelcomeSectionTitleWrap}>
              <Ionicons color={theme.colors.accentPink} name="sparkles-outline" size={22} />
              <Text style={styles.shindigsWelcomeSectionTitle}>Active Shindigs</Text>
            </View>
            <Pressable
              onPress={() =>
                setExpandedWelcomeSection((current) => (current === 'active' ? null : 'active'))
              }
              style={styles.shindigsWelcomeSeeAll}
            >
              <Text style={styles.shindigsWelcomeSeeAllText}>See all</Text>
              <Ionicons color={theme.colors.accentPink} name="chevron-forward" size={18} />
            </Pressable>
          </View>
          {activeShindigs.length > 0 ? (
            <View style={styles.shindigsWelcomeCardList}>
              {displayedActiveShindigs.map((shindig) => (
                <Pressable
                  key={shindig.id}
                  onPress={() => openPastShindig(shindig)}
                  style={styles.shindigsWelcomeUpcomingCard}
                >
                  <Image
                    source={{
                      uri:
                        shindig.coverPhotoThumbnailUrl ||
                        shindig.coverPhotoUrl ||
                        'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1200&q=80',
                    }}
                    style={styles.shindigsWelcomeUpcomingImage}
                  />
                  <View style={styles.shindigsWelcomeUpcomingCopy}>
                    <Text style={styles.shindigsWelcomeUpcomingTitle}>{shindig.title}</Text>
                    <View style={styles.shindigsWelcomeMetaRow}>
                      <Ionicons color={theme.colors.accentPink} name="location-outline" size={17} />
                      <Text style={styles.shindigsWelcomeMetaText}>
                        {shindig.stops[0]?.place.address ||
                          shindig.stops[0]?.place.title ||
                          'Location coming soon'}
                      </Text>
                    </View>
                  </View>
                  <Ionicons color={theme.colors.accentPink} name="chevron-forward" size={28} />
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.shindigsWelcomeEmptyCard}>
              <View style={styles.shindigsWelcomeEmptyIconWrap}>
                <Ionicons color="#9D7CFF" name="sparkles-outline" size={38} />
              </View>
              <View style={styles.shindigsWelcomeEmptyCopy}>
                <Text style={styles.shindigsWelcomeEmptyTitle}>No active Shindigs</Text>
                <Text style={styles.shindigsWelcomeEmptyText}>
                  Once your shindig starts, it will show up here.
                </Text>
              </View>
            </View>
          )}

          <View style={styles.shindigsWelcomeSectionHeader}>
            <View style={styles.shindigsWelcomeSectionTitleWrap}>
              <Ionicons color={theme.colors.accentPink} name="checkmark-circle" size={22} />
              <Text style={styles.shindigsWelcomeSectionTitle}>Completed Shindigs</Text>
            </View>
            <Pressable
              onPress={() =>
                setExpandedWelcomeSection((current) =>
                  current === 'completed' ? null : 'completed'
                )
              }
              style={styles.shindigsWelcomeSeeAll}
            >
              <Text style={styles.shindigsWelcomeSeeAllText}>See all</Text>
              <Ionicons color={theme.colors.accentPink} name="chevron-forward" size={18} />
            </Pressable>
          </View>
          {completedShindigs.length > 0 ? (
            <View style={styles.shindigsWelcomeCardList}>
              {displayedCompletedShindigs.map((shindig) => (
                <Pressable
                  key={shindig.id}
                  onPress={() => openPastShindig(shindig)}
                  style={styles.shindigsWelcomeUpcomingCard}
                >
                  <Image
                    source={{
                      uri:
                        shindig.coverPhotoThumbnailUrl ||
                        shindig.coverPhotoUrl ||
                        'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1200&q=80',
                    }}
                    style={styles.shindigsWelcomeUpcomingImage}
                  />
                  <View style={styles.shindigsWelcomeUpcomingCopy}>
                    <Text style={styles.shindigsWelcomeUpcomingTitle}>{shindig.title}</Text>
                    <View style={styles.shindigsWelcomeMetaRow}>
                      <Ionicons color={theme.colors.accentPink} name="trophy-outline" size={17} />
                      <Text style={styles.shindigsWelcomeMetaText}>
                        Completed {formatDateLabel(shindig.createdAt)}
                      </Text>
                    </View>
                  </View>
                  <Ionicons color={theme.colors.accentPink} name="chevron-forward" size={28} />
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.shindigsWelcomeEmptyCard}>
              <View style={styles.shindigsWelcomeEmptyIconWrap}>
                <Ionicons color="#9D7CFF" name="trophy-outline" size={38} />
              </View>
              <View style={styles.shindigsWelcomeEmptyCopy}>
                <Text style={styles.shindigsWelcomeEmptyTitle}>No completed Shindigs</Text>
                <Text style={styles.shindigsWelcomeEmptyText}>
                  Your past shindigs will appear here.
                </Text>
              </View>
            </View>
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
    const upcomingChatPreview = [...upcomingChatMessages].slice(-2).reverse();
    const upcomingItemsBadgeCount = activeFeedShindig.bringItems.filter(
      (item) => !item.claimedBy
    ).length;
    const upcomingChatBadgeCount = upcomingChatMessages.length;

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
              contentContainerStyle={styles.upcomingMockContent}
              keyboardShouldPersistTaps="handled"
              ref={feedScrollRef}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.upcomingMockHeaderRow}>
                <View style={styles.upcomingMockHeaderTopBar}>
                  <Pressable
                    onPress={handleBackFromFeedScreen}
                    style={styles.upcomingMockBackButton}
                  >
                    <Ionicons color={theme.colors.textPrimary} name="chevron-back" size={26} />
                  </Pressable>
                  <View style={styles.upcomingMockHeaderActions}>{headerActions}</View>
                </View>
                <View style={styles.upcomingMockHeaderMain}>
                  <Image source={{ uri: coverPhotoUri }} style={styles.upcomingMockThumb} />
                  <View style={styles.upcomingMockHeaderCopy}>
                    <Text numberOfLines={1} style={styles.upcomingMockTitle}>
                      {activeFeedShindig.title}
                    </Text>
                    <View style={styles.upcomingMockMetaLine}>
                      <Ionicons color={theme.colors.textMuted} name="calendar-outline" size={15} />
                      <Text numberOfLines={2} style={styles.upcomingMockMetaText}>
                        {activeFeedShindig.plannedFor
                          ? formatPlannedDateLabel(activeFeedShindig.plannedFor)
                          : 'Date coming soon'}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() =>
                        void openNavigationAddressPrompt(
                          activeFeedShindig.stops[0]?.place.address ||
                            activeFeedShindig.stops[0]?.place.title ||
                            ''
                        )
                      }
                      style={styles.upcomingMockMetaLine}
                    >
                      <Ionicons color={theme.colors.textMuted} name="location-outline" size={15} />
                      <Text numberOfLines={2} style={styles.upcomingMockMetaText}>
                        {activeFeedShindig.stops[0]?.place.address ||
                          activeFeedShindig.stops[0]?.place.title ||
                          'Location coming soon'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              <View style={styles.upcomingMockTabs}>
                <Pressable
                  onPress={scrollUpcomingOverviewToTop}
                  style={[
                    styles.upcomingMockTab,
                    activeUpcomingOverviewTab === 'overview' && styles.upcomingMockTabActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.upcomingMockTabText,
                      activeUpcomingOverviewTab === 'overview' && styles.upcomingMockTabActiveText,
                    ]}
                  >
                    Overview
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => scrollToUpcomingSection('chat')}
                  style={[
                    styles.upcomingMockTab,
                    activeUpcomingOverviewTab === 'chat' && styles.upcomingMockTabActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.upcomingMockTabText,
                      activeUpcomingOverviewTab === 'chat' && styles.upcomingMockTabActiveText,
                    ]}
                  >
                    Chat
                  </Text>
                  {upcomingChatBadgeCount > 0 ? (
                    <View style={styles.upcomingMockCountBadge}>
                      <Text style={styles.upcomingMockCountBadgeText}>{upcomingChatBadgeCount}</Text>
                    </View>
                  ) : null}
                </Pressable>
                <Pressable
                  onPress={() => scrollToUpcomingSection('bring')}
                  style={[
                    styles.upcomingMockTab,
                    activeUpcomingOverviewTab === 'items' && styles.upcomingMockTabActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.upcomingMockTabText,
                      activeUpcomingOverviewTab === 'items' && styles.upcomingMockTabActiveText,
                    ]}
                  >
                    Items
                  </Text>
                  {upcomingItemsBadgeCount > 0 ? (
                    <View style={styles.upcomingMockCountBadge}>
                      <Text style={styles.upcomingMockCountBadgeText}>{upcomingItemsBadgeCount}</Text>
                    </View>
                  ) : null}
                </Pressable>
                <Pressable
                  onPress={() => scrollToUpcomingSection('photos')}
                  style={[
                    styles.upcomingMockTab,
                    activeUpcomingOverviewTab === 'photos' && styles.upcomingMockTabActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.upcomingMockTabText,
                      activeUpcomingOverviewTab === 'photos' && styles.upcomingMockTabActiveText,
                    ]}
                  >
                    Photos
                  </Text>
                </Pressable>
                {activeFeedShindig.ownerId === userId ? (
                  <Pressable
                    onPress={() => {
                      setActiveUpcomingOverviewTab('invite');
                      handleInviteMorePeopleFromMenu();
                    }}
                    style={[
                      styles.upcomingMockTab,
                      activeUpcomingOverviewTab === 'invite' && styles.upcomingMockTabActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.upcomingMockTabText,
                        activeUpcomingOverviewTab === 'invite' && styles.upcomingMockTabActiveText,
                      ]}
                    >
                      Invite
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.upcomingMockActionRow}>
                <Pressable
                  onPress={() => scrollToUpcomingSection('chat')}
                  style={[styles.upcomingMockActionTile, styles.upcomingMockActionTilePink]}
                >
                  <View style={styles.upcomingMockActionIconPink}>
                    <Ionicons color="#FFFFFF" name="chatbubble-ellipses" size={19} />
                  </View>
                  <Text style={styles.upcomingMockActionText}>Chat</Text>
                  {upcomingChatBadgeCount > 0 ? (
                    <View style={styles.upcomingMockActionBadge}>
                      <Text style={styles.upcomingMockActionBadgeText}>{upcomingChatBadgeCount}</Text>
                    </View>
                  ) : null}
                </Pressable>
                <Pressable
                  onPress={() => scrollToUpcomingSection('bring')}
                  style={styles.upcomingMockActionTile}
                >
                  <View style={styles.upcomingMockActionIconPurple}>
                    <Ionicons color="#FFFFFF" name="gift-outline" size={19} />
                  </View>
                  <Text style={styles.upcomingMockActionText}>
                    {activeFeedShindig.ownerId === userId ? 'Add Item' : 'View Items'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleUpcomingPrimaryPhotoAction()}
                  style={styles.upcomingMockActionTile}
                >
                  <View style={styles.upcomingMockActionIconPurple}>
                    <Ionicons color="#FFFFFF" name="camera-outline" size={19} />
                  </View>
                  <Text style={styles.upcomingMockActionText}>Upload Photo</Text>
                </Pressable>
              </View>

              <View
                onLayout={(event) => {
                  sectionOffsetsRef.current.bring = event.nativeEvent.layout.y;
                }}
                style={styles.upcomingMockCard}
              >
                  <View style={styles.upcomingPanelHeader}>
                    <View style={styles.upcomingPanelHeaderLeft}>
                      <Ionicons color={theme.colors.accentPink} name="briefcase-outline" size={16} />
                      <Text style={styles.upcomingPanelTitle}>Things to Bring</Text>
                    </View>
                    {activeFeedShindig.ownerId === userId ? (
                      <Pressable onPress={() => scrollToUpcomingSection('bring')}>
                        <Text style={styles.upcomingPanelActionLink}>+ Add Item</Text>
                      </Pressable>
                    ) : (
                      <Text style={styles.upcomingPanelActionText}>Help make this shindig amazing</Text>
                    )}
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
                        <View key={item.id} style={styles.upcomingMockItemRow}>
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

              <View
                onLayout={(event) => {
                  sectionOffsetsRef.current.chat = event.nativeEvent.layout.y;
                }}
                style={styles.upcomingMockCard}
              >
                    <View style={styles.upcomingPanelHeader}>
                      <View style={styles.upcomingPanelHeaderLeft}>
                        <Ionicons color={theme.colors.accentPink} name="chatbubble-outline" size={16} />
                        <Text style={styles.upcomingPanelTitle}>Chat</Text>
                      </View>
                      <Pressable onPress={() => onOpenShindigChat?.(activeFeedShindig.id)}>
                        <Text style={styles.upcomingPanelActionLink}>View messages</Text>
                      </Pressable>
                    </View>
                    <View style={styles.upcomingActivityList}>
                      {upcomingChatPreview.map((comment) => (
                        <View key={comment.id} style={styles.upcomingMockChatRow}>
                          <Image source={{ uri: comment.author.avatar }} style={styles.upcomingMockChatAvatar} />
                          <View style={styles.upcomingActivityCopy}>
                            <View style={styles.upcomingMockChatTopRow}>
                              <Text style={styles.upcomingActivityTitle}>{comment.author.name}</Text>
                              <Text style={styles.upcomingActivityTime}>
                                {formatRelativeTimestamp(comment.createdAt)}
                              </Text>
                            </View>
                            <Text style={styles.upcomingMockChatBody}>{comment.body}</Text>
                          </View>
                        </View>
                      ))}
                      {upcomingChatPreview.length === 0 ? (
                        <Text style={styles.bringListEmptyText}>No chat messages yet.</Text>
                      ) : null}
                    </View>
                    <View style={styles.commentComposer}>
                      <TextInput
                        onChangeText={setShindigCommentDraft}
                        onSubmitEditing={() => void handleSendUpcomingChatMessage()}
                        placeholder="Type a message..."
                        placeholderTextColor={theme.colors.textMuted}
                        style={styles.commentInput}
                        value={shindigCommentDraft}
                      />
                      <Pressable
                        onPress={() => void handleSendUpcomingChatMessage()}
                        style={styles.commentButton}
                      >
                        <Ionicons color="#FFFFFF" name="send" size={16} />
                      </Pressable>
                    </View>
                  </View>

              <View
                onLayout={(event) => {
                  sectionOffsetsRef.current.memories = event.nativeEvent.layout.y;
                }}
                style={styles.upcomingMockCard}
              >
                  <View style={styles.upcomingPanelHeader}>
                    <View style={styles.upcomingPanelHeaderLeft}>
                      <Ionicons color={theme.colors.accentPink} name="camera" size={16} />
                      <Text style={styles.upcomingPanelTitle}>Photos</Text>
                    </View>
                    <Pressable
                      onPress={() => setPlannedFeedViewMode('feed')}
                      style={styles.upcomingMemoriesAction}
                    >
                      <Text style={styles.upcomingPanelActionLink}>See all</Text>
                    </Pressable>
                  </View>
                  <View style={styles.upcomingMemoriesGrid}>
                    {feedPhotos.slice(0, 3).map((photo) => (
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
                    <Pressable
                      onPress={() => void handleUpcomingPrimaryPhotoAction()}
                      style={styles.upcomingMockAddPhotoTile}
                    >
                      <Ionicons color={theme.colors.accentPink} name="add" size={28} />
                      <Text style={styles.upcomingMockAddPhotoText}>Add Photo</Text>
                    </Pressable>
                    {feedPhotos.length === 0 ? (
                      <View style={styles.upcomingMemoriesEmpty}>
                        <Text style={styles.bringListEmptyText}>
                          Photos will appear here once the shindig starts.
                        </Text>
                      </View>
                    ) : null}
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
          ref={createFlowScrollRef}
          showsVerticalScrollIndicator={false}
        >
          <PageHeader
            onBack={() => {
              if (step === 'invite' && inviteFlowMode === 'existing') {
                closeInvitePicker();
                return;
              }

              setStep('welcome');
            }}
            right={headerActions}
            title={step === 'create' ? 'Create' : 'Invite'}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {step === 'create' ? (
            <View style={styles.createShindigCard}>
              <Text style={styles.createShindigTitle}>Create Shindig</Text>
              <Text style={styles.createShindigSubtitle}>
                Fill in the details to get started.
              </Text>

              <View style={styles.createSectionCard}>
                <View style={styles.createSectionBlock}>
                  <View style={styles.createSectionHeader}>
                    <View style={styles.createSectionIcon}>
                      <Ionicons color={theme.colors.accentPink} name="sparkles-outline" size={20} />
                    </View>
                    <View style={styles.createSectionHeaderCopy}>
                      <Text style={styles.createSectionTitle}>Shindig Name*</Text>
                      <Text style={styles.createSectionSubtitle}>Give your ShinDig a name</Text>
                    </View>
                  </View>
                  <View style={styles.createFieldWrap}>
                    <TextInput
                      maxLength={50}
                      onChangeText={setShindigName}
                      placeholder="e.g. Barry's Birthday Bash"
                      placeholderTextColor={theme.colors.textMuted}
                      style={styles.createFieldInput}
                      value={shindigName}
                    />
                    <Text style={styles.createFieldCount}>{shindigName.length}/50</Text>
                  </View>
                </View>

                <View style={styles.createDivider} />

                <View style={styles.createSectionBlock}>
                  <View style={styles.createSectionHeader}>
                    <View style={styles.createSectionIcon}>
                      <Ionicons color={theme.colors.accentPink} name="location-outline" size={20} />
                    </View>
                    <View style={styles.createSectionHeaderCopy}>
                      <Text style={styles.createSectionTitle}>Location*</Text>
                      <Text style={styles.createSectionSubtitle}>
                        Where&apos;s the shindig happening?
                      </Text>
                    </View>
                  </View>
                  <View style={styles.createLocationInputWrap}>
                    <Ionicons color={theme.colors.accentPink} name="search" size={22} />
                    <TextInput
                      onChangeText={(value) => {
                        setLocationQuery(value);
                        setSelectedLocation(null);
                        setError('');
                      }}
                      placeholder="Search address or type any place"
                      placeholderTextColor={theme.colors.textMuted}
                      style={styles.createLocationInput}
                      value={locationQuery}
                    />
                    <Ionicons color={theme.colors.accentPink} name="locate-outline" size={20} />
                  </View>
                  {isSearchingLocations ? (
                    <Text style={styles.helperText}>Searching addresses...</Text>
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
                  </View>
                </View>

                <View style={styles.createDivider} />

                <View style={styles.createDateTimeRow}>
                  <View style={styles.createDateTimeCell}>
                    <View style={styles.createSectionHeader}>
                      <View style={styles.createSectionIcon}>
                        <Ionicons color={theme.colors.accentPink} name="calendar-outline" size={20} />
                      </View>
                      <View style={styles.createSectionHeaderCopy}>
                        <Text style={styles.createSectionTitle}>Date*</Text>
                        <Text style={styles.createSectionSubtitle}>Pick a date</Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => {
                        setShowPlannedTimePicker(false);
                        setShowPlannedDatePicker((current) => !current);
                      }}
                      style={styles.createDateTimeButton}
                    >
                      <View style={styles.createDateTimeButtonLeft}>
                        <Ionicons color="#F2B4A0" name="calendar-outline" size={18} />
                        <Text style={styles.createDateTimeButtonText}>
                          {new Date(plannedFor).toLocaleDateString('en-US', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </Text>
                      </View>
                      <Ionicons color={theme.colors.textSecondary} name="chevron-down" size={18} />
                    </Pressable>
                    {showPlannedDatePicker ? (
                      <View style={styles.createDateTimePickerPanel}>
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
                          style={[
                            styles.createDateTimePicker,
                            Platform.OS === 'ios' ? styles.createDateSpinnerPicker : null,
                          ]}
                          textColor={theme.colors.textPrimary}
                          themeVariant="dark"
                          value={plannedFor}
                        />
                        </View>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.createDateTimeDivider} />

                  <View style={styles.createDateTimeCell}>
                    <View style={styles.createSectionHeader}>
                      <View style={styles.createSectionIcon}>
                        <Ionicons color={theme.colors.accentPink} name="time-outline" size={20} />
                      </View>
                      <View style={styles.createSectionHeaderCopy}>
                        <Text style={styles.createSectionTitle}>Start Time*</Text>
                        <Text style={styles.createSectionSubtitle}>Pick a start time</Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => {
                        setShowPlannedDatePicker(false);
                        setShowPlannedTimePicker((current) => !current);
                      }}
                      style={styles.createDateTimeButton}
                    >
                      <View style={styles.createDateTimeButtonLeft}>
                        <Ionicons color="#F2B4A0" name="time-outline" size={18} />
                        <Text style={styles.createDateTimeButtonText}>
                          {formatPlannedTimeLabel(plannedFor.toISOString())}
                        </Text>
                      </View>
                      <Ionicons color={theme.colors.textSecondary} name="chevron-down" size={18} />
                    </Pressable>
                    {showPlannedTimePicker ? (
                      <View style={styles.createDateTimePickerPanel}>
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
                          style={styles.createDateTimePicker}
                          textColor={theme.colors.textPrimary}
                          themeVariant="dark"
                          value={plannedFor}
                        />
                        </View>
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={styles.createDivider} />

                <View style={styles.createSectionBlock}>
                  <View style={styles.createSectionHeader}>
                    <View style={styles.createSectionIcon}>
                      <Ionicons color={theme.colors.accentPink} name="gift-outline" size={20} />
                    </View>
                    <View style={styles.createSectionHeaderCopy}>
                      <Text style={styles.createSectionTitle}>Things To Bring</Text>
                      <Text style={styles.createSectionSubtitle}>
                        Add items so guests can claim them.
                      </Text>
                    </View>
                  </View>
                  <View style={styles.bringListComposer}>
                    <TextInput
                      onChangeText={setInitialBringItemDraft}
                      onSubmitEditing={handleAddInitialBringItem}
                      placeholder="Add an item to bring"
                      placeholderTextColor={theme.colors.textMuted}
                      returnKeyType="done"
                      style={styles.bringListInput}
                      value={initialBringItemDraft}
                    />
                    <Pressable onPress={handleAddInitialBringItem} style={styles.bringListAddButton}>
                      <Text style={styles.bringListAddButtonText}>Add</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.createPopularIdeasLabel}>Popular ideas</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.createIdeasScroll}
                  >
                    <View style={styles.createIdeasRow}>
                      {[
                        ['beer-outline', 'Drinks'],
                        ['fast-food-outline', 'Snacks'],
                        ['cube-outline', 'Ice'],
                        ['restaurant-outline', 'Utensils'],
                        ['mail-outline', 'Napkins'],
                      ].map(([icon, label]) => (
                        <Pressable
                          key={label}
                          onPress={() => handleAddSuggestedBringItem(label)}
                          style={styles.createIdeaChip}
                        >
                          <Ionicons color="#FFFFFF" name={icon as never} size={18} />
                          <Text style={styles.createIdeaChipText}>{label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                  {initialBringItems.length > 0 ? (
                    <View style={styles.createSelectedItemsWrap}>
                      {initialBringItems.map((item) => (
                        <Pressable
                          key={item}
                          onPress={() => handleRemoveInitialBringItem(item)}
                          style={styles.createSelectedItemChip}
                        >
                          <Text style={styles.createSelectedItemText}>{item}</Text>
                          <Ionicons color={theme.colors.accentPink} name="close" size={14} />
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>

                <View style={styles.createDivider} />

                <View style={styles.createSectionBlock}>
                  <View style={styles.createSectionHeader}>
                    <View style={styles.createSectionIcon}>
                      <Ionicons color={theme.colors.accentPink} name="image-outline" size={20} />
                    </View>
                    <View style={styles.createSectionHeaderCopy}>
                      <Text style={styles.createSectionTitle}>Cover Photo</Text>
                      <Text style={styles.createSectionSubtitle}>
                        Choose a cover photo for your Shindig.
                      </Text>
                    </View>
                  </View>
                  <View style={styles.createCoverRow}>
                    <Pressable onPress={openPhotoSourcePicker} style={styles.createCoverTile}>
                      <Ionicons color={theme.colors.accentPink} name="camera-outline" size={34} />
                      <Text style={styles.createCoverTileTitle}>Upload Photo</Text>
                      <Text style={styles.createCoverTileSubtitle}>Choose from gallery</Text>
                    </Pressable>
                    <View style={[styles.createCoverTile, styles.createCoverTileMuted]}>
                      <Ionicons color="rgba(255,79,160,0.7)" name="sparkles" size={34} />
                      <Text style={styles.createCoverTileComingSoon}>COMING SOON</Text>
                      <Text style={styles.createCoverTileSubtitle}>
                        We&apos;ll help you pick the perfect shot
                      </Text>
                    </View>
                  </View>
                  {photos.length > 0 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.createCoverPreviewScroll}
                    >
                      <View style={styles.photoRow}>
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
                  ) : null}
                </View>

                <Pressable onPress={continueToInvite} style={styles.createContinueButton}>
                  <Text style={styles.createContinueButtonText}>Continue</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {step === 'invite' ? (
            <View style={styles.panel}>
              <View style={styles.createInviteCard}>
                <Text style={styles.createInviteTitle}>Invite People</Text>
                <Text style={styles.createInviteSubtitle}>
                  {inviteFlowMode === 'existing'
                    ? 'Add more friends or contacts to this ShinDig'
                    : 'Add friends or contacts to your ShinDig'}
                </Text>

                {inviteFlowMode === 'create' ? (
                  <View style={styles.createInviteMessageCard}>
                    <View style={styles.createInviteMessageHeader}>
                      <View style={styles.createInviteMessageIconWrap}>
                        <Ionicons color="#FFFFFF" name="chatbubble-ellipses" size={22} />
                      </View>
                      <View style={styles.createInviteMessageCopy}>
                        <Text style={styles.createInviteMessageTitle}>Personalize your invite</Text>
                        <Text style={styles.createInviteMessageSubtitle}>
                          Add a message to make it special.
                        </Text>
                      </View>
                      <Ionicons
                        color={theme.colors.textMuted}
                        name="chevron-forward"
                        size={20}
                      />
                    </View>

                    <Text style={styles.createInviteSectionTitle}>Invite Message</Text>
                    <View style={styles.createInviteMessageInputWrap}>
                      <TextInput
                        maxLength={120}
                        multiline
                        onChangeText={setInviteMessageDraft}
                        placeholder="Write something guests should know..."
                        placeholderTextColor={theme.colors.textMuted}
                        style={styles.createInviteMessageInput}
                        textAlignVertical="top"
                        value={inviteMessageDraft}
                      />
                      <Text style={styles.createInviteMessageCount}>
                        {inviteMessageDraft.length}/120
                      </Text>
                    </View>
                  </View>
                ) : null}

                <Text style={styles.createInviteSectionTitle}>Add People</Text>
                <View style={styles.createInviteSearchRow}>
                  <View style={styles.createInviteSearchInputWrap}>
                    <Ionicons
                      color={theme.colors.textMuted}
                      name="search"
                      size={20}
                      style={styles.createInviteSearchIcon}
                    />
                    <TextInput
                      onChangeText={(value) => {
                        setInviteSearch(value);
                        setError('');
                      }}
                      placeholder="Search friends or Shindig users..."
                      placeholderTextColor={theme.colors.textMuted}
                      style={styles.createInviteSearchInput}
                      value={inviteSearch}
                    />
                  </View>
                  <Pressable
                    onPress={() => setShowCreateInviteContacts((current) => !current)}
                    style={styles.createInviteSearchAction}
                  >
                    <Ionicons color={theme.colors.accentPink} name="person-add-outline" size={22} />
                  </Pressable>
                </View>

                {isSearchingInviteUsers ? (
                  <Text style={styles.helperText}>Searching ShinDig users...</Text>
                ) : null}
                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                {inviteFlowMode === 'create' && selectedAppInviteCount > 0 ? (
                  <>
                    <View style={styles.inviteSectionHeader}>
                      <Text style={styles.inviteSectionLabel}>Friends On This Shindig</Text>
                      <Pressable
                        onPress={() => {
                          setSelectedFriendIds([]);
                          setSelectedInviteUsersById({});
                        }}
                      >
                        <Text style={styles.createInviteDeselectText}>Deselect All</Text>
                      </Pressable>
                    </View>
                    <View style={styles.contactList}>
                      {selectedFriends.map((friend) => (
                        <View key={friend.id} style={styles.createInvitePersonCard}>
                          <Image source={{ uri: friend.avatar }} style={styles.createInviteAvatar} />
                          <View style={styles.createInvitePersonCopy}>
                            <Text style={styles.createInvitePersonName}>{friend.name}</Text>
                            <Text style={styles.createInvitePersonMeta}>
                              {friend.handle} {friend.city ? `| ${friend.city}` : ''}
                            </Text>
                          </View>
                          <Pressable
                            onPress={() => toggleFriend(friend.id)}
                            style={[styles.createInviteActionButton, styles.createInviteRemoveButton]}
                          >
                            <Text style={styles.createInviteRemoveButtonText}>Remove</Text>
                          </Pressable>
                        </View>
                      ))}
                      {selectedInviteUsers.map((profile) => (
                        <View key={profile.id} style={styles.createInvitePersonCard}>
                          <Image source={{ uri: profile.avatar }} style={styles.createInviteAvatar} />
                          <View style={styles.createInvitePersonCopy}>
                            <Text style={styles.createInvitePersonName}>{profile.name}</Text>
                            <Text style={styles.createInvitePersonMeta}>
                              {profile.handle} {profile.city ? `| ${profile.city}` : ''}
                            </Text>
                          </View>
                          <Pressable
                            onPress={() => toggleInviteUser(profile)}
                            style={[styles.createInviteActionButton, styles.createInviteRemoveButton]}
                          >
                            <Text style={styles.createInviteRemoveButtonText}>Remove</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}

                {inviteSearch.trim().length >= 2 ? (
                  <>
                    <Text style={styles.inviteSectionLabel}>
                      {inviteSearchResults.length > 0
                        ? 'Suggested ShinDig Users'
                        : 'Other Users On ShinDig'}
                    </Text>
                    {inviteSearchResults.length > 0 ? (
                      <View style={styles.contactList}>
                        {inviteSearchResults.map((profile) => {
                          const isSelected = Boolean(selectedInviteUsersById[profile.id]);
                          const isAccepted = acceptedInviteeIds.has(profile.id);
                          const actionKey = `user:${profile.id}`;
                          const isActing = actingInviteActionKey === actionKey;
                          return (
                            <View key={profile.id} style={styles.createInvitePersonCard}>
                              <Image source={{ uri: profile.avatar }} style={styles.createInviteAvatar} />
                              <View style={styles.createInvitePersonCopy}>
                                <Text style={styles.createInvitePersonName}>{profile.name}</Text>
                                <Text style={styles.createInvitePersonMeta}>
                                  {profile.handle} {profile.city ? `| ${profile.city}` : ''}
                                </Text>
                              </View>
                              {inviteFlowMode === 'existing' && isAccepted ? (
                                <View
                                  style={[
                                    styles.createInviteActionButton,
                                    styles.createInviteAcceptedButton,
                                  ]}
                                >
                                  <Ionicons color="#63D89A" name="checkmark" size={16} />
                                  <Text style={styles.createInviteAcceptedButtonText}>Accepted</Text>
                                </View>
                              ) : (
                                <Pressable
                                  disabled={inviteFlowMode === 'existing' ? isSelected || isActing : false}
                                  onPress={() =>
                                    inviteFlowMode === 'existing'
                                      ? void handleImmediateInvite({
                                          actionKey,
                                          inviteUsers: [profile],
                                        })
                                      : toggleInviteUser(profile)
                                  }
                                  style={[
                                    styles.createInviteActionButton,
                                    isSelected
                                      ? styles.createInviteRemoveButton
                                      : styles.createInviteAddButton,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.createInviteActionButtonText,
                                      isSelected && styles.createInviteRemoveButtonText,
                                    ]}
                                  >
                                    {inviteFlowMode === 'existing'
                                      ? isSelected
                                        ? 'Invited'
                                        : isActing
                                          ? 'Sending...'
                                          : 'Invite'
                                      : isSelected
                                        ? 'Remove'
                                        : 'Add'}
                                  </Text>
                                </Pressable>
                              )}
                            </View>
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

                {unselectedFriends.length > 0 ? (
                  <>
                    <Text style={styles.inviteSectionLabel}>Suggested Friends</Text>
                    <View style={styles.contactList}>
                      {unselectedFriends.slice(0, 3).map((friend) => (
                        (() => {
                          const isAccepted = acceptedInviteeIds.has(friend.id);
                          const isActing = actingInviteActionKey === `friend:${friend.id}`;
                          return (
                        <View key={friend.id} style={styles.createInvitePersonCard}>
                          <Image source={{ uri: friend.avatar }} style={styles.createInviteAvatar} />
                          <View style={styles.createInvitePersonCopy}>
                            <Text style={styles.createInvitePersonName}>{friend.name}</Text>
                            <Text style={styles.createInvitePersonMeta}>{friend.handle}</Text>
                          </View>
                          {inviteFlowMode === 'existing' && isAccepted ? (
                            <View
                              style={[
                                styles.createInviteActionButton,
                                styles.createInviteAcceptedButton,
                              ]}
                            >
                              <Ionicons color="#63D89A" name="checkmark" size={16} />
                              <Text style={styles.createInviteAcceptedButtonText}>Accepted</Text>
                            </View>
                          ) : (
                            <Pressable
                              disabled={inviteFlowMode === 'existing' && isActing}
                              onPress={() =>
                                inviteFlowMode === 'existing'
                                  ? void handleImmediateInvite({
                                      actionKey: `friend:${friend.id}`,
                                      inviteUsers: [friend],
                                    })
                                  : toggleFriend(friend.id)
                              }
                              style={[styles.createInviteActionButton, styles.createInviteAddButton]}
                            >
                              <Text style={styles.createInviteActionButtonText}>
                                {inviteFlowMode === 'existing' && isActing
                                  ? 'Sending...'
                                  : inviteFlowMode === 'existing'
                                    ? 'Invite'
                                    : 'Add'}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                          );
                        })()
                      ))}
                    </View>
                  </>
                ) : null}

                {inviteFlowMode === 'create' ? (
                  <View style={styles.createInviteShareCard}>
                    <View style={styles.createInviteShareCopyRow}>
                      <View style={styles.createInviteShareCopy}>
                        <Text style={styles.createInviteShareTitle}>Invite friends</Text>
                        <Text style={styles.createInviteShareSubtitle}>
                          Share your Shindig and invite friends to join the fun!
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      disabled={isSavingShindig}
                      onPress={() => void saveShindigAndOpenFeed({ shareAfterSave: true })}
                      style={styles.createInviteShareButton}
                    >
                      <Ionicons color={theme.colors.accentPink} name="share-social-outline" size={20} />
                      <Text style={styles.createInviteShareButtonText}>
                        {isSavingShindig ? 'Sharing...' : 'Invite'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {inviteFlowMode === 'create' ? (
                  <Pressable
                    disabled={isSavingShindig}
                    onPress={() => void saveShindigAndOpenFeed()}
                    style={[styles.createInviteSendButton, isSavingShindig && styles.buttonDisabled]}
                  >
                    <Ionicons color="#FFFFFF" name="arrow-forward" size={20} />
                    <Text style={styles.createInviteSendButtonText}>
                      {isSavingShindig ? 'Continuing...' : 'Continue'}
                    </Text>
                  </Pressable>
                ) : null}

                <Pressable
                  disabled={isSavingShindig}
                  onPress={skipInvites}
                  style={styles.secondaryTextButton}
                >
                  <Text style={styles.createInviteSkipText}>
                    {inviteFlowMode === 'existing' ? 'Back to ShinDig' : 'Skip for now'}
                  </Text>
                </Pressable>
              </View>
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
    paddingHorizontal: 0,
    paddingVertical: theme.spacing.xs,
  },
  createDateTimePicker: {
    alignSelf: 'stretch',
    width: '100%',
  },
  createDateSpinnerPicker: {
    alignSelf: 'center',
    transform: [{ scaleX: 0.92 }, { scaleY: 0.92 }],
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
  inviteMessageInput: {
    minHeight: 96,
    paddingTop: theme.spacing.md,
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
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  suggestionItem: {
    backgroundColor: 'rgba(20, 31, 55, 0.68)',
    borderColor: 'rgba(120, 139, 184, 0.18)',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  suggestionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  suggestionMeta: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  createShindigCard: {
    paddingBottom: theme.spacing.xl,
  },
  createShindigTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1,
  },
  createShindigSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    marginTop: theme.spacing.xs,
  },
  createSectionCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderStrong,
    borderRadius: 30,
    borderWidth: 1,
    marginTop: theme.spacing.xl,
    overflow: 'hidden',
  },
  createSectionBlock: {
    padding: theme.spacing.lg,
  },
  createDivider: {
    backgroundColor: theme.colors.border,
    height: 1,
  },
  createSectionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  createSectionIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(65, 29, 73, 0.75)',
    borderRadius: 18,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  createSectionHeaderCopy: {
    flex: 1,
  },
  createSectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  createSectionSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    marginTop: 4,
  },
  createFieldWrap: {
    backgroundColor: 'rgba(20, 31, 55, 0.82)',
    borderColor: theme.colors.border,
    borderRadius: 22,
    borderWidth: 1,
    marginTop: theme.spacing.md,
    minHeight: 92,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  createFieldInput: {
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 24,
    minHeight: 40,
  },
  createFieldCount: {
    alignSelf: 'flex-end',
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: theme.spacing.sm,
  },
  createLocationInputWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 31, 55, 0.82)',
    borderColor: theme.colors.border,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: theme.spacing.md,
    minHeight: 64,
    paddingHorizontal: theme.spacing.md,
  },
  createLocationInput: {
    color: '#FFFFFF',
    flex: 1,
    fontSize: 16,
    marginHorizontal: theme.spacing.sm,
    minHeight: 52,
  },
  createDateTimeRow: {
    flexDirection: 'column',
    overflow: 'visible',
  },
  createDateTimeCell: {
    overflow: 'visible',
    padding: theme.spacing.lg,
  },
  createDateTimePickerPanel: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
  },
  createDateTimeDivider: {
    backgroundColor: theme.colors.border,
    height: 1,
  },
  createDateTimeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 31, 55, 0.82)',
    borderColor: theme.colors.border,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.md,
    minHeight: 60,
    paddingHorizontal: theme.spacing.md,
  },
  createDateTimeButtonLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  createDateTimeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  createPopularIdeasLabel: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: theme.spacing.md,
  },
  createIdeasScroll: {
    marginTop: theme.spacing.md,
  },
  createIdeasRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingRight: theme.spacing.sm,
  },
  createIdeaChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 31, 55, 0.82)',
    borderColor: theme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minHeight: 56,
    paddingHorizontal: theme.spacing.md,
  },
  createIdeaChipText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  createSelectedItemsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  createSelectedItemChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 79, 160, 0.12)',
    borderColor: 'rgba(255, 79, 160, 0.38)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  createSelectedItemText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  createCoverRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  createCoverTile: {
    alignItems: 'center',
    borderColor: 'rgba(255, 79, 160, 0.45)',
    borderRadius: 24,
    borderStyle: 'dashed',
    borderWidth: 2,
    flex: 1,
    justifyContent: 'center',
    minHeight: 190,
    padding: theme.spacing.lg,
  },
  createCoverTileMuted: {
    backgroundColor: 'rgba(16, 24, 43, 0.72)',
    borderColor: 'rgba(94, 73, 126, 0.4)',
    borderStyle: 'solid',
  },
  createCoverTileTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginTop: theme.spacing.md,
    textAlign: 'center',
  },
  createCoverTileSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
  createCoverTileComingSoon: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginTop: theme.spacing.md,
  },
  createCoverPreviewScroll: {
    marginTop: theme.spacing.md,
  },
  createContinueButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentPink,
    borderRadius: 24,
    justifyContent: 'center',
    margin: theme.spacing.lg,
    minHeight: 62,
  },
  createContinueButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  shindigsWelcomeContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxxl,
    paddingTop: 20,
  },
  shindigsWelcomeHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  shindigsWelcomeCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: theme.spacing.md,
  },
  shindigsWelcomeActions: {
    flexShrink: 0,
  },
  shindigsWelcomeTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1,
  },
  shindigsWelcomeSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    marginTop: theme.spacing.xs,
  },
  shindigsWelcomePrimaryCta: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentPink,
    borderRadius: 28,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'center',
    marginTop: theme.spacing.xl,
    minHeight: 82,
  },
  shindigsWelcomePrimaryCtaText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  shindigsWelcomeSectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.xl,
  },
  shindigsWelcomeSectionTitleWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  shindigsWelcomeSectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  shindigsWelcomeSeeAll: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  shindigsWelcomeSeeAllText: {
    color: theme.colors.accentPink,
    fontSize: 14,
    fontWeight: '800',
  },
  shindigsWelcomeCardList: {
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  shindigsWelcomeUpcomingCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderStrong,
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 142,
    padding: theme.spacing.md,
  },
  shindigsWelcomeUpcomingImage: {
    borderRadius: 20,
    height: 110,
    width: 110,
  },
  shindigsWelcomeUpcomingCopy: {
    flex: 1,
    marginLeft: theme.spacing.md,
    marginRight: theme.spacing.md,
  },
  shindigsWelcomeUpcomingTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    marginVertical: 10,
  },
  shindigsWelcomeMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  shindigsWelcomeMetaText: {
    color: theme.colors.textSecondary,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  shindigsWelcomeEmptyCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderStrong,
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: theme.spacing.md,
    minHeight: 170,
    padding: theme.spacing.lg,
  },
  shindigsWelcomeEmptyIconWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(54, 36, 92, 0.6)',
    borderRadius: 999,
    height: 124,
    justifyContent: 'center',
    width: 124,
  },
  shindigsWelcomeEmptyCopy: {
    flex: 1,
    marginLeft: theme.spacing.lg,
  },
  shindigsWelcomeEmptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  shindigsWelcomeEmptyText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: theme.spacing.sm,
  },
  createInviteCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderStrong,
    borderRadius: 30,
    borderWidth: 1,
    padding: theme.spacing.lg,
  },
  createInviteTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1,
  },
  createInviteSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    marginTop: theme.spacing.xs,
  },
  createInviteMessageCard: {
    backgroundColor: 'rgba(18, 29, 53, 0.82)',
    borderColor: theme.colors.border,
    borderRadius: 24,
    borderWidth: 1,
    marginTop: theme.spacing.xl,
    padding: theme.spacing.md,
  },
  createInviteMessageHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  createInviteMessageIconWrap: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentPink,
    borderRadius: 18,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  createInviteMessageCopy: {
    flex: 1,
  },
  createInviteMessageTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  createInviteMessageSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  createInviteSectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginTop: theme.spacing.lg,
  },
  createInviteMessageInputWrap: {
    backgroundColor: 'rgba(8, 16, 34, 0.86)',
    borderColor: theme.colors.accentPink,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: theme.spacing.sm,
    minHeight: 140,
    padding: theme.spacing.md,
  },
  createInviteMessageInput: {
    color: '#FFFFFF',
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  createInviteMessageCount: {
    alignSelf: 'flex-end',
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: theme.spacing.sm,
  },
  createInviteSearchRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  createInviteSearchInputWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(10, 18, 37, 0.9)',
    borderColor: theme.colors.border,
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    minHeight: 58,
    paddingHorizontal: theme.spacing.md,
  },
  createInviteSearchIcon: {
    marginRight: theme.spacing.sm,
  },
  createInviteSearchInput: {
    color: '#FFFFFF',
    flex: 1,
    fontSize: 16,
    minHeight: 52,
  },
  createInviteSearchAction: {
    alignItems: 'center',
    backgroundColor: 'rgba(10, 18, 37, 0.9)',
    borderColor: theme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  createInviteDeselectText: {
    color: theme.colors.accentPink,
    fontSize: 13,
    fontWeight: '800',
  },
  createInvitePersonCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 35, 62, 0.88)',
    borderColor: theme.colors.border,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  createInviteAvatar: {
    borderRadius: theme.radius.round,
    height: 52,
    width: 52,
  },
  createInviteContactAvatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(72, 92, 138, 0.4)',
    borderRadius: theme.radius.round,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  createInvitePersonCopy: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  createInvitePersonName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  createInvitePersonMeta: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  createInviteActionButton: {
    alignItems: 'center',
    borderRadius: theme.radius.round,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: 42,
    minWidth: 86,
    paddingHorizontal: theme.spacing.md,
  },
  createInviteAddButton: {
    borderColor: theme.colors.accentPink,
  },
  createInviteRemoveButton: {
    backgroundColor: 'rgba(23, 35, 62, 0.96)',
    borderColor: theme.colors.border,
  },
  createInviteAcceptedButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(16, 44, 31, 0.72)',
    borderColor: 'rgba(99, 216, 154, 0.4)',
    flexDirection: 'row',
    gap: 6,
  },
  createInviteActionButtonText: {
    color: theme.colors.accentPink,
    fontSize: 13,
    fontWeight: '800',
  },
  createInviteAcceptedButtonText: {
    color: '#63D89A',
    fontSize: 13,
    fontWeight: '800',
  },
  createInviteRemoveButtonText: {
    color: theme.colors.textPrimary,
  },
  createInviteShareCard: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(16, 24, 46, 0.92)',
    borderColor: theme.colors.border,
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
  createInviteShareCopyRow: {
    alignItems: 'flex-start',
    flex: 1,
    minWidth: 0,
  },
  createInviteShareCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: theme.spacing.sm,
  },
  createInviteShareTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
  },
  createInviteShareSubtitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    lineHeight: 24,
    marginTop: theme.spacing.sm,
    opacity: 0.86,
  },
  createInviteShareButton: {
    alignItems: 'center',
    alignSelf: 'center',
    borderColor: theme.colors.accentPink,
    borderRadius: theme.radius.round,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginLeft: theme.spacing.md,
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  createInviteShareButtonText: {
    color: theme.colors.accentPink,
    fontSize: 17,
    fontWeight: '800',
  },
  createInvitePhoneRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(18, 29, 53, 0.82)',
    borderColor: theme.colors.border,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  createInvitePhoneIconWrap: {
    alignItems: 'center',
    borderColor: 'rgba(255, 79, 160, 0.34)',
    borderRadius: 16,
    borderWidth: 1,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  createInvitePhoneCopy: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  createInvitePhoneTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  createInvitePhoneSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  createInviteSendButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentPink,
    borderRadius: 22,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'center',
    marginTop: theme.spacing.xl,
    minHeight: 58,
    paddingHorizontal: theme.spacing.lg,
  },
  createInviteSendButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  createInviteSkipText: {
    color: theme.colors.accentPink,
    fontSize: 16,
    fontWeight: '800',
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
    marginTop: theme.spacing.md,
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
  upcomingMockContent: {
    paddingBottom: theme.spacing.xxxl,
    paddingHorizontal: theme.spacing.sm,
    paddingTop: theme.spacing.lg,
  },
  upcomingMockHeaderRow: {
    gap: theme.spacing.md,
  },
  upcomingMockHeaderTopBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  upcomingMockBackButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 36,
  },
  upcomingMockHeaderMain: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    minWidth: 0,
  },
  upcomingMockThumb: {
    borderRadius: theme.radius.lg,
    flexShrink: 0,
    height: 96,
    width: 96,
  },
  upcomingMockHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  upcomingMockHeaderActions: {
    flexShrink: 0,
  },
  upcomingMockTitle: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.9,
  },
  upcomingMockMetaLine: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  upcomingMockMetaText: {
    color: theme.colors.textMuted,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  upcomingMockTabs: {
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
    marginTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  upcomingMockTab: {
    alignItems: 'center',
    flexShrink: 1,
    flexDirection: 'row',
    gap: 6,
    paddingBottom: theme.spacing.sm,
  },
  upcomingMockTabActive: {
    borderBottomColor: theme.colors.accentPink,
    borderBottomWidth: 3,
    flexShrink: 1,
    paddingBottom: theme.spacing.sm,
  },
  upcomingMockTabText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  upcomingMockTabActiveText: {
    color: theme.colors.accentPink,
    fontSize: 14,
    fontWeight: '800',
  },
  upcomingMockCountBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentPink,
    borderRadius: theme.radius.round,
    height: 22,
    justifyContent: 'center',
    minWidth: 22,
    paddingHorizontal: 6,
  },
  upcomingMockCountBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  upcomingMockActionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  upcomingMockActionTile: {
    backgroundColor: '#21153F',
    borderColor: 'rgba(166, 107, 255, 0.26)',
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    flex: 1,
    minHeight: 96,
    padding: theme.spacing.md,
  },
  upcomingMockActionTilePink: {
    backgroundColor: 'rgba(71, 23, 66, 0.9)',
    borderColor: 'rgba(255, 79, 160, 0.26)',
  },
  upcomingMockActionIconPink: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentPink,
    borderRadius: 18,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  upcomingMockActionIconPurple: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentPurple,
    borderRadius: 18,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  upcomingMockActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: theme.spacing.sm,
    maxWidth: '85%',
  },
  upcomingMockActionBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentPink,
    borderRadius: theme.radius.round,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: theme.spacing.md,
    top: theme.spacing.md,
    width: 24,
  },
  upcomingMockActionBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  upcomingMockCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    marginTop: theme.spacing.lg,
    padding: theme.spacing.lg,
  },
  upcomingMockItemRow: {
    backgroundColor: 'transparent',
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    paddingBottom: theme.spacing.md,
    paddingTop: theme.spacing.xs,
  },
  upcomingMockChatRow: {
    alignItems: 'flex-start',
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  upcomingMockChatAvatar: {
    borderRadius: theme.radius.round,
    height: 42,
    width: 42,
  },
  upcomingMockChatTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  upcomingMockChatBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  upcomingMockAddPhotoTile: {
    alignItems: 'center',
    borderColor: 'rgba(255, 79, 160, 0.4)',
    borderRadius: theme.radius.lg,
    borderStyle: 'dashed',
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 110,
    width: '31%',
  },
  upcomingMockAddPhotoText: {
    color: theme.colors.accentPink,
    fontSize: 14,
    fontWeight: '700',
    marginTop: theme.spacing.sm,
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
