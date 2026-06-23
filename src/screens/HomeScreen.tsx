import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import * as Contacts from 'expo-contacts';
import * as FileSystem from 'expo-file-system/legacy';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as SMS from 'expo-sms';
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
import { searchPlaces } from '../lib/places';
import { createNotification } from '../lib/notifications';
import {
  addPhotoToShindig,
  addPhotoComment,
  addShindigComment,
  createAppFriendShindigInvites,
  createPhoneShindigInvite,
  deletePhotoComment,
  deleteShindigComment,
  getShindigById,
  listPhotoLikeProfiles,
  togglePhotoLike,
  toggleShindigLike,
} from '../lib/shindigs';
import { supabase } from '../lib/supabase';
import { theme } from '../theme';
import {
  FriendProfile,
  SavedShindig,
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
  onFlowStepChange?: (step: FlowStep) => void;
  onConsumeInitialFeedShindig?: () => void;
  onConsumeInitialHighlightedPhotoId?: () => void;
  onConsumeInitialStep?: () => void;
  onShindigSaved: (args: {
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

function formatCommentTimestamp(value: string) {
  return new Date(value).toLocaleString('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
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
  return state === 'active' ? 'Active' : 'Completed';
}

function sortPhotosNewestFirst<T extends { createdAt: string }>(photos: T[]) {
  return [...photos].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

export function HomeScreen({
  friends,
  headerActions,
  onBackFromFeed,
  initialFeedShindig,
  initialHighlightedPhotoId,
  initialStep,
  onFlowStepChange,
  onConsumeInitialFeedShindig,
  onConsumeInitialHighlightedPhotoId,
  onConsumeInitialStep,
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
  const [shindigName, setShindigName] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [locationResults, setLocationResults] = useState<TimelinePlace[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<TimelinePlace | null>(null);
  const [contacts, setContacts] = useState<InviteContact[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [selectedContactsById, setSelectedContactsById] = useState<Record<string, InviteContact>>(
    {}
  );
  const [inviteSearch, setInviteSearch] = useState('');
  const [isInvitePickerOpen, setIsInvitePickerOpen] = useState(false);
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
  const [isLikeSheetVisible, setIsLikeSheetVisible] = useState(false);
  const [isLoadingLikeSheet, setIsLoadingLikeSheet] = useState(false);
  const [likeSheetProfiles, setLikeSheetProfiles] = useState<FriendProfile[]>([]);
  const [likeSheetTitle, setLikeSheetTitle] = useState('Liked by');
  const deferredLocationQuery = useDeferredValue(locationQuery);
  const feedScrollRef = useRef<ScrollView | null>(null);
  const photoOffsetsRef = useRef<Record<string, number>>({});
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
  const activeShindigs = useMemo(
    () => shindigs.filter((shindig) => shindig.state === 'active'),
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

  useEffect(() => {
    onFlowStepChange?.(step);
  }, [onFlowStepChange, step]);

  useEffect(() => {
    if (!initialFeedShindig) {
      return;
    }

    setError('');
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
      allowsMultipleSelection: true,
      base64: true,
      mediaTypes: ['images'],
      quality: 0.8,
      selectionLimit: 10,
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
        localUri: asset.uri,
      }));

    setPhotos((current) => [...current, ...nextPhotos]);
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
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]?.base64 || !result.assets[0]?.uri) {
      return;
    }

    const asset = result.assets[0];
    setPhotos((current) => [
      ...current,
      {
        base64: asset.base64!,
        contentType: asset.mimeType,
        fileExtension: fileExtensionFromUri(asset.uri),
        localUri: asset.uri,
      },
    ]);
  }

  function openPhotoSourcePicker() {
    const options = ['Take Photo', 'Select From Library', 'Cancel'];
    const cancelButtonIndex = 2;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          cancelButtonIndex,
          options,
          title: 'Add Photo',
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

    Alert.alert('Add Photo', 'Choose a photo source.', [
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
    ]);
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
        quality: 0.8,
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
        quality: 0.8,
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
    setShindigName('');
    setSelectedFriendIds([]);
    setSelectedContactsById({});
    setInviteSearch('');
    setIsInvitePickerOpen(false);
    setContacts([]);
    setActiveFeedShindig(null);
    setFeedBackMode('welcome');
    setStep('create');
  }

  function openPastShindig(shindig: SavedShindig) {
    setError('');
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
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [activeFeedShindig?.id, step]);

  useEffect(() => {
    if (step !== 'feed' || !activeFeedShindig) {
      return;
    }

    const intervalId = setInterval(() => {
      void refreshActiveFeed(activeFeedShindig.id);
    }, 4000);

    return () => {
      clearInterval(intervalId);
    };
  }, [activeFeedShindig?.id, step]);

  async function continueToInvite() {
    if (!shindigName.trim()) {
      setError('Name your shindig before continuing.');
      return;
    }

    if (photos.length === 0) {
      setError('Add at least one photo before continuing.');
      return;
    }

    if (!selectedLocation && !locationQuery.trim()) {
      setError('Choose a starting location before continuing.');
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
    setIsInvitePickerOpen(true);
    await loadDeviceContacts({ reset: true });
  }

  function closeInvitePicker() {
    contactsRequestIdRef.current += 1;
    setIsLoadingContacts(false);
    setInviteSearch('');
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
        stops: [
          {
            photos,
            place: startingPlace,
          },
        ],
        title: shindigName.trim(),
        userId,
      });

      const inviteIssues: string[] = [];

      if (selectedFriends.length > 0) {
        try {
          const invites = await createAppFriendShindigInvites({
            friendIds: selectedFriends.map((friend) => friend.id),
            inviterUserId: userId,
            shindigId: savedShindig.id,
          });

          await Promise.all(
            invites
              .filter((invite) => invite.status === 'pending' && invite.invitee_user_id)
              .map((invite) =>
                createNotification({
                  actorUserId: userId,
                  inviteId: invite.id,
                  message: `${profile.name} added you to the ShinDig "${savedShindig.title}".`,
                  recipientUserId: invite.invitee_user_id!,
                  shindigId: savedShindig.id,
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
            shindigId: savedShindig.id,
          });
          if (!invite.invite_token) {
            throw new Error('The text-message invite link could not be created.');
          }
          const inviteUrl = `${INVITE_LINK_BASE}?invite=${encodeURIComponent(
            invite.invite_token
          )}`;

          await SMS.sendSMSAsync(
            selectedContacts.map((contact) => contact.phoneNumber),
            `${profile.name} invited you to join the ShinDig "${savedShindig.title}". If you are new, sign up first. If you already have ShinDig, open this link to review the invite: ${inviteUrl}`
          );
        } catch (nextError) {
          inviteIssues.push(
            nextError instanceof Error
              ? nextError.message
              : 'The text-message invites could not be sent.'
          );
        }
      }

      setActiveFeedShindig(savedShindig);
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

    const wasLiked = activeFeedShindig.likedByMe;
    await toggleShindigLike({
      shindigId: activeFeedShindig.id,
      userId,
    });
    if (!wasLiked && activeFeedShindig.ownerId !== userId) {
      await createNotification({
        actorUserId: userId,
        message: `${profile.name} liked your ShinDig "${activeFeedShindig.title}".`,
        recipientUserId: activeFeedShindig.ownerId,
        shindigId: activeFeedShindig.id,
        type: 'shindig_like',
      });
    }
    await refreshActiveFeed(activeFeedShindig.id);
  }

  async function handleAddShindigComment() {
    if (!activeFeedShindig || !shindigCommentDraft.trim()) {
      return;
    }

    await addShindigComment({
      body: shindigCommentDraft,
      shindigId: activeFeedShindig.id,
      userId,
    });
    if (activeFeedShindig.ownerId !== userId) {
      await createNotification({
        actorUserId: userId,
        message: `${profile.name} commented on your ShinDig "${activeFeedShindig.title}".`,
        recipientUserId: activeFeedShindig.ownerId,
        shindigId: activeFeedShindig.id,
        type: 'shindig_comment',
      });
    }
    setShindigCommentDraft('');
    await refreshActiveFeed(activeFeedShindig.id);
  }

  async function handleTogglePhotoLike(photoId: string) {
    if (!activeFeedShindig) {
      return;
    }

    const targetPhoto = activeFeedShindig.stops.flatMap((stop) => stop.photos).find((photo) => photo.id === photoId);
    const wasLiked = targetPhoto?.likedByMe;
    const recipientUserId = getPhotoNotificationRecipient(activeFeedShindig, photoId);
    await togglePhotoLike({
      photoId,
      userId,
    });
    if (!wasLiked && recipientUserId !== userId) {
      await createNotification({
        actorUserId: userId,
        message: `${profile.name} liked a photo in your ShinDig "${activeFeedShindig.title}".`,
        photoId,
        recipientUserId,
        shindigId: activeFeedShindig.id,
        type: 'photo_like',
      });
    }
    await refreshActiveFeed(activeFeedShindig.id);
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

    const recipientUserId = getPhotoNotificationRecipient(activeFeedShindig, photoId);

    await addPhotoComment({
      body: nextBody,
      photoId,
      userId,
    });
    if (recipientUserId !== userId) {
      await createNotification({
        actorUserId: userId,
        message: `${profile.name} commented on a photo in your ShinDig "${activeFeedShindig.title}".`,
        photoId,
        recipientUserId,
        shindigId: activeFeedShindig.id,
        type: 'photo_comment',
      });
    }
    setPhotoCommentDrafts((current) => ({ ...current, [photoId]: '' }));
    await refreshActiveFeed(activeFeedShindig.id);
  }

  async function handleDeleteShindigComment(commentId: string) {
    if (!activeFeedShindig) {
      return;
    }

    await deleteShindigComment({
      commentId,
      userId,
    });
    await refreshActiveFeed(activeFeedShindig.id);
  }

  async function handleDeletePhotoComment(commentId: string) {
    if (!activeFeedShindig) {
      return;
    }

    await deletePhotoComment({
      commentId,
      userId,
    });
    await refreshActiveFeed(activeFeedShindig.id);
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

  function openShindigOwnerMenu() {
    if (!activeFeedShindig) {
      return;
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          cancelButtonIndex: 1,
          destructiveButtonIndex: 0,
          options: ['Delete ShinDig', 'Cancel'],
          title: activeFeedShindig.title,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            openDeleteShindigPrompt();
          }
        }
      );
      return;
    }

    openDeleteShindigPrompt();
  }

  function openPhotoOwnerMenu(photo: SavedShindigPhoto) {
    const isCurrentCover = activeFeedShindig?.coverPhotoPhotoId === photo.id;
    const canSelectCover = activeFeedShindig?.ownerId === userId;
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

  async function handleAddPhotoToSharedShindig() {
    if (
      !activeFeedShindig ||
      activeFeedShindig.ownerId === userId ||
      activeFeedShindig.state !== 'active'
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
      activeFeedShindig.state !== 'active'
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
      activeFeedShindig.state !== 'active'
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
      activeFeedShindig.state !== 'active'
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

          {activeShindigs.length === 0 && completedShindigs.length === 0 ? (
            <Text style={styles.emptyText}>
              Start your first ShinDig to build a shared photo feed and archive it here.
            </Text>
          ) : (
            <>
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
                        : styles.stateBadgeCompleted,
                    ]}
                  >
                    <Text
                      style={[
                        styles.stateBadgeText,
                        activeFeedShindig.state === 'active'
                          ? styles.stateBadgeTextActive
                          : styles.stateBadgeTextCompleted,
                      ]}
                    >
                      {shindigStateLabel(activeFeedShindig.state)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.feedParticipants}>
                  {activeFeedCreatorLabel} • {feedPhotos.length} photo{feedPhotos.length === 1 ? '' : 's'}
                </Text>
              </View>
              {activeFeedShindig.ownerId === userId ? (
                <View style={styles.feedOwnerControls}>
                  <View style={styles.feedHeaderActions}>
                    {activeFeedShindig.state === 'active' ? (
                      <Pressable
                        onPress={handleAddPhotoToOwnedShindig}
                        style={styles.addPhotoHeaderButton}
                      >
                        <Ionicons color="#FFFFFF" name="add" size={22} />
                      </Pressable>
                    ) : null}

                    <Pressable
                      onPress={() =>
                        handleUpdateShindigState(
                          activeFeedShindig.state === 'active' ? 'completed' : 'active'
                        )
                      }
                      style={[
                        styles.stateActionButton,
                        activeFeedShindig.state === 'active'
                          ? styles.completeButton
                          : styles.reactivateButton,
                      ]}
                    >
                      <Ionicons
                        color={
                          activeFeedShindig.state === 'active'
                            ? theme.colors.textPrimary
                            : '#FFFFFF'
                        }
                        name={
                          activeFeedShindig.state === 'active'
                            ? 'checkmark'
                            : 'refresh-outline'
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
            activeFeedShindig.state === 'active' &&
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
                {activeFeedShindig.state === 'active' ? (
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
                      <View style={styles.feedAuthorRow}>
                        <Text style={styles.feedAuthor}>
                          {photo.contributor?.name || activeFeedOwner?.name || 'ShinDig Owner'}
                        </Text>
                        {photo.contributor ? (
                          <Text style={styles.photoCredit}>via {photo.contributor.handle}</Text>
                        ) : null}
                        {activeFeedShindig.coverPhotoPhotoId === photo.id ? (
                          <View style={styles.coverPhotoBadge}>
                            <Text style={styles.coverPhotoBadgeText}>Cover</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.feedCardHeaderActions}>
                        <Text style={styles.feedTime}>Just now</Text>
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
                    <ProgressiveImage
                      containerStyle={styles.feedPhotoFrame}
                      imageStyle={styles.feedPhoto}
                      resizeMode="contain"
                      sourceUri={photo.photoUrl}
                    />
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

              <Text style={[styles.fieldLabel, styles.spacedLabel]}>Add Photo</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.photoRow}>
                  <Pressable onPress={openPhotoSourcePicker} style={styles.addPhotoCard}>
                    <Text style={styles.addPhotoPlus}>+</Text>
                    <Text style={styles.addPhotoText}>Add Photo</Text>
                  </Pressable>
                  {photos.map((photo) => (
                    <View key={photo.localUri} style={styles.photoPreviewWrap}>
                      <Image source={{ uri: photo.localUri }} style={styles.photoPreview} />
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
                    Choose contacts to text and friends already on ShinDig. You can also skip this
                    for now and start the feed immediately.
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
                    onChangeText={setInviteSearch}
                    placeholder="Search friends on ShinDig..."
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.input}
                    value={inviteSearch}
                  />

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

                  <Pressable
                    disabled={
                      isSavingShindig || selectedContacts.length + selectedFriends.length === 0
                    }
                    onPress={saveShindigAndOpenFeed}
                    style={[
                      styles.ctaButton,
                      (isSavingShindig || selectedContacts.length + selectedFriends.length === 0) &&
                        styles.buttonDisabled,
                    ]}
                  >
                    <Text style={styles.ctaButtonText}>
                      {isSavingShindig
                        ? 'Starting...'
                        : `Continue with ${selectedContacts.length + selectedFriends.length}`}
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
    backgroundColor: theme.colors.accent,
    borderColor: 'rgba(255, 196, 184, 0.32)',
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
  photoPreviewWrap: {
    position: 'relative',
  },
  photoPreview: {
    borderRadius: theme.radius.lg,
    height: 108,
    width: 108,
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
    backgroundColor: '#FF615A',
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
    borderColor: '#FF615A',
    borderWidth: 2,
  },
  feedCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  feedCardHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  feedAuthor: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  feedAuthorRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
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
    marginTop: theme.spacing.sm,
    overflow: 'hidden',
  },
  photoCredit: {
    color: theme.colors.textMuted,
    fontSize: 12,
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
    backgroundColor: '#FF615A',
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

