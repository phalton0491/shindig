import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import * as Contacts from 'expo-contacts';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as SMS from 'expo-sms';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { searchPlaces } from '../lib/places';
import { createNotification } from '../lib/notifications';
import {
  addPhotoComment,
  addShindigComment,
  createPhotoAddRequest,
  deletePhotoComment,
  deleteShindigComment,
  getShindigById,
  togglePhotoLike,
  toggleShindigLike,
} from '../lib/shindigs';
import { theme } from '../theme';
import { SavedShindig, TimelinePlace, UserProfile } from '../types/models';

type HomeScreenProps = {
  initialFeedShindig?: SavedShindig | null;
  initialHighlightedPhotoId?: string | null;
  onConsumeInitialFeedShindig?: () => void;
  onConsumeInitialHighlightedPhotoId?: () => void;
  onShindigSaved: (args: {
    stops: {
      photos: DraftPhoto[];
      place: TimelinePlace;
      scheduledTime?: string;
    }[];
    title: string;
    userId: string;
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

const INVITE_SIGNUP_URL = 'shindig://signup';

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

export function HomeScreen({
  initialFeedShindig,
  initialHighlightedPhotoId,
  onConsumeInitialFeedShindig,
  onConsumeInitialHighlightedPhotoId,
  onShindigSaved,
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
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState('');
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
  const [isSubmittingPhotoRequest, setIsSubmittingPhotoRequest] = useState(false);
  const [shindigCommentDraft, setShindigCommentDraft] = useState('');
  const [photoCommentDrafts, setPhotoCommentDrafts] = useState<Record<string, string>>({});
  const [requestedPhotoShindigIds, setRequestedPhotoShindigIds] = useState<string[]>([]);
  const [showPhotoRequestPrompt, setShowPhotoRequestPrompt] = useState(false);
  const [highlightedPhotoId, setHighlightedPhotoId] = useState('');
  const deferredLocationQuery = useDeferredValue(locationQuery);
  const deferredContactSearch = useDeferredValue(contactSearch);
  const feedScrollRef = useRef<ScrollView | null>(null);
  const photoOffsetsRef = useRef<Record<string, number>>({});

  const filteredContacts = useMemo(() => {
    const query = deferredContactSearch.trim().toLowerCase();
    if (!query) {
      return contacts;
    }

    return contacts.filter(
      (contact) =>
        contact.name.toLowerCase().includes(query) ||
        contact.phoneNumber.toLowerCase().includes(query)
    );
  }, [contacts, deferredContactSearch]);

  const selectedContacts = useMemo(
    () => contacts.filter((contact) => selectedContactIds.includes(contact.id)),
    [contacts, selectedContactIds]
  );

  useEffect(() => {
    if (!initialFeedShindig) {
      return;
    }

    setError('');
    setActiveFeedShindig(initialFeedShindig);
    setStep('feed');
    onConsumeInitialFeedShindig?.();
  }, [initialFeedShindig, onConsumeInitialFeedShindig]);

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

  useEffect(() => {
    if (step !== 'invite' || contacts.length > 0) {
      return;
    }

    let isMounted = true;

    async function loadContacts() {
      setIsLoadingContacts(true);
      try {
        const permission = await Contacts.requestPermissionsAsync();
        if (!isMounted || permission.status !== 'granted') {
          setContacts([]);
          return;
        }

        const result = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers],
          pageSize: 200,
          sort: Contacts.SortTypes.FirstName,
        });

        if (!isMounted) {
          return;
        }

        const nextContacts = (result.data || [])
          .map((contact) => {
            const firstPhone = contact.phoneNumbers?.[0]?.number?.trim();
            if (!contact.id || !contact.name || !firstPhone) {
              return null;
            }

            return {
              id: contact.id,
              name: contact.name,
              phoneNumber: firstPhone,
            } satisfies InviteContact;
          })
          .filter((contact): contact is InviteContact => Boolean(contact));

        setContacts(nextContacts);
      } catch (nextError) {
        if (isMounted) {
          setError(
            nextError instanceof Error ? nextError.message : 'Could not load contacts.'
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingContacts(false);
        }
      }
    }

    loadContacts();

    return () => {
      isMounted = false;
    };
  }, [contacts.length, step]);

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

  function removePhoto(localUri: string) {
    setPhotos((current) => current.filter((photo) => photo.localUri !== localUri));
  }

  function selectLocation(place: TimelinePlace) {
    setSelectedLocation(place);
    setLocationQuery(place.title);
    setLocationResults([]);
  }

  function goToCreate() {
    setError('');
    setSelectedLocation(null);
    setLocationQuery('');
    setLocationResults([]);
    setPhotos([]);
    setShindigName('');
    setSelectedContactIds([]);
    setContactSearch('');
    setActiveFeedShindig(null);
    setStep('create');
  }

  function openPastShindig(shindig: SavedShindig) {
    setError('');
    setActiveFeedShindig(shindig);
    setStep('feed');
  }

  async function refreshActiveFeed(shindigId: string) {
    setIsRefreshingFeed(true);
    try {
      const refreshed = await getShindigById({
        shindigId,
        userId,
      });

      if (refreshed) {
        setActiveFeedShindig(refreshed);
      }
    } finally {
      setIsRefreshingFeed(false);
    }
  }

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

    setStep('invite');
  }

  function toggleContact(contactId: string) {
    setSelectedContactIds((current) =>
      current.includes(contactId)
        ? current.filter((id) => id !== contactId)
        : [...current, contactId]
    );
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
      if (selectedContacts.length > 0 && (await SMS.isAvailableAsync())) {
        const inviteName = shindigName.trim() || 'ShinDig';
        await SMS.sendSMSAsync(
          selectedContacts.map((contact) => contact.phoneNumber),
          `${profile.name} invited you to ${inviteName} at ${startingPlace.title}. Sign up to join the ShinDig: ${INVITE_SIGNUP_URL}`
        );
      }

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

      setActiveFeedShindig(savedShindig);
      setStep('feed');
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
    if (!wasLiked) {
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
    await createNotification({
      actorUserId: userId,
      message: `${profile.name} commented on your ShinDig "${activeFeedShindig.title}".`,
      recipientUserId: activeFeedShindig.ownerId,
      shindigId: activeFeedShindig.id,
      type: 'shindig_comment',
    });
    setShindigCommentDraft('');
    await refreshActiveFeed(activeFeedShindig.id);
  }

  async function handleTogglePhotoLike(photoId: string) {
    if (!activeFeedShindig) {
      return;
    }

    const targetPhoto = activeFeedShindig.stops.flatMap((stop) => stop.photos).find((photo) => photo.id === photoId);
    const wasLiked = targetPhoto?.likedByMe;
    await togglePhotoLike({
      photoId,
      userId,
    });
    if (!wasLiked) {
      await createNotification({
        actorUserId: userId,
        message: `${profile.name} liked a photo in your ShinDig "${activeFeedShindig.title}".`,
        photoId,
        recipientUserId: activeFeedShindig.ownerId,
        shindigId: activeFeedShindig.id,
        type: 'photo_like',
      });
    }
    await refreshActiveFeed(activeFeedShindig.id);
  }

  async function handleAddPhotoComment(photoId: string) {
    if (!activeFeedShindig) {
      return;
    }

    const nextBody = photoCommentDrafts[photoId]?.trim();
    if (!nextBody) {
      return;
    }

    await addPhotoComment({
      body: nextBody,
      photoId,
      userId,
    });
    await createNotification({
      actorUserId: userId,
      message: `${profile.name} commented on a photo in your ShinDig "${activeFeedShindig.title}".`,
      photoId,
      recipientUserId: activeFeedShindig.ownerId,
      shindigId: activeFeedShindig.id,
      type: 'photo_comment',
    });
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

  async function handleRequestToAddPhoto() {
    if (!activeFeedShindig || activeFeedShindig.ownerId === userId) {
      return;
    }

    setShowPhotoRequestPrompt((current) => !current);
  }

  async function submitPhotoRequest(source: 'camera' | 'library') {
    if (!activeFeedShindig || activeFeedShindig.ownerId === userId) {
      return;
    }

    setError('');
    let result: ImagePicker.ImagePickerResult;

    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError('Camera access is required to request a photo contribution.');
        return;
      }

      result = await ImagePicker.launchCameraAsync({
        base64: true,
        mediaTypes: ['images'],
        quality: 0.8,
      });
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Photo library access is required to request a photo contribution.');
        return;
      }

      result = await ImagePicker.launchImageLibraryAsync({
        base64: true,
        mediaTypes: ['images'],
        quality: 0.8,
        selectionLimit: 1,
      });
    }

    if (result.canceled || !result.assets[0]?.base64 || !result.assets[0]?.uri) {
      return;
    }

    const asset = result.assets[0];
    setIsSubmittingPhotoRequest(true);
    try {
      const request = await createPhotoAddRequest({
        photo: {
          base64: asset.base64!,
          contentType: asset.mimeType,
          fileExtension: fileExtensionFromUri(asset.uri),
          localUri: asset.uri,
        },
        recipientUserId: activeFeedShindig.ownerId,
        requesterUserId: userId,
        shindigId: activeFeedShindig.id,
      });

      await createNotification({
        actorUserId: userId,
        message: `${profile.name} wants to add a photo to your ShinDig "${activeFeedShindig.title}".`,
        requestId: request.id,
        recipientUserId: activeFeedShindig.ownerId,
        shindigId: activeFeedShindig.id,
        type: 'photo_add_request',
      });
      setRequestedPhotoShindigIds((current) =>
        current.includes(activeFeedShindig.id) ? current : [...current, activeFeedShindig.id]
      );
      setShowPhotoRequestPrompt(false);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to send the photo request.'
      );
    } finally {
      setIsSubmittingPhotoRequest(false);
    }
  }

  if (step === 'welcome') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <View />
            <View style={styles.topSpacer} />
          </View>

          <Pressable onPress={goToCreate} style={styles.ctaButton}>
            <Text style={styles.ctaButtonText}>Start a Shindig</Text>
          </Pressable>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Past Shindigs</Text>
          </View>

          {shindigs.length > 0 ? (
            <View style={styles.pastList}>
              {shindigs.map((shindig) => (
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
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>
              Start your first ShinDig to build a shared photo feed and archive it here.
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'feed' && activeFeedShindig) {
    const feedPhotos = activeFeedShindig.stops.flatMap((stop) => stop.photos);

    return (
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            ref={feedScrollRef}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.topBar}>
              <Pressable onPress={() => setStep('welcome')} style={styles.backButton}>
                <Ionicons color={theme.colors.textPrimary} name="chevron-back" size={24} />
              </Pressable>
              <Text style={styles.screenTitle}>Shindig Feed</Text>
              <View style={styles.topSpacer} />
            </View>

            <View style={styles.feedHeader}>
              <View>
                <Text style={styles.feedLocation}>{activeFeedShindig.title}</Text>
                <Text style={styles.feedParticipants}>
                  {feedPhotos.length} photo{feedPhotos.length === 1 ? '' : 's'}
                </Text>
              </View>
              <View style={styles.topSpacer} />
            </View>

            <View style={styles.shindigSocialCard}>
              <View style={styles.socialRow}>
                <Pressable onPress={handleToggleShindigLike} style={styles.socialButton}>
                  <Text style={styles.socialButtonText}>
                    {activeFeedShindig.likedByMe ? 'Liked' : 'Like'} {activeFeedShindig.likeCount}
                  </Text>
                </Pressable>
                <Text style={styles.socialMeta}>
                  {activeFeedShindig.comments.length} comment
                  {activeFeedShindig.comments.length === 1 ? '' : 's'}
                </Text>
                {isRefreshingFeed ? <Text style={styles.socialMeta}>Updating...</Text> : null}
              </View>

              {activeFeedShindig.ownerId !== userId ? (
                <View style={styles.requestPhotoWrap}>
                  <Pressable
                    disabled={requestedPhotoShindigIds.includes(activeFeedShindig.id)}
                    onPress={handleRequestToAddPhoto}
                    style={[
                      styles.requestPhotoButton,
                      requestedPhotoShindigIds.includes(activeFeedShindig.id) &&
                        styles.requestPhotoButtonDisabled,
                    ]}
                  >
                    <Text style={styles.requestPhotoButtonText}>
                      {requestedPhotoShindigIds.includes(activeFeedShindig.id)
                        ? 'Photo request sent'
                        : 'Request to add photo'}
                    </Text>
                  </Pressable>

                  {showPhotoRequestPrompt &&
                  !requestedPhotoShindigIds.includes(activeFeedShindig.id) ? (
                    <View style={styles.requestPromptCard}>
                      <Text style={styles.requestPromptTitle}>Add a photo request</Text>
                      <Text style={styles.requestPromptText}>
                        Choose a photo from your library or take a new one for this ShinDig.
                      </Text>
                      <View style={styles.requestPromptActions}>
                        <Pressable
                          disabled={isSubmittingPhotoRequest}
                          onPress={() => submitPhotoRequest('camera')}
                          style={styles.requestPromptButton}
                        >
                          <Text style={styles.requestPromptButtonText}>Take photo</Text>
                        </Pressable>
                        <Pressable
                          disabled={isSubmittingPhotoRequest}
                          onPress={() => submitPhotoRequest('library')}
                          style={styles.requestPromptButton}
                        >
                          <Text style={styles.requestPromptButtonText}>Choose photo</Text>
                        </Pressable>
                      </View>
                      {isSubmittingPhotoRequest ? (
                        <Text style={styles.helperText}>Uploading request...</Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : null}

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
                      <Text style={styles.feedAuthor}>{profile.name}</Text>
                      {photo.contributor ? (
                        <Text style={styles.photoCredit}>via {photo.contributor.handle}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.feedTime}>Just now</Text>
                  </View>
                  <Image source={{ uri: photo.photoUrl }} style={styles.feedPhoto} />
                  <View style={styles.socialRow}>
                    <Pressable
                      onPress={() => handleTogglePhotoLike(photo.id)}
                      style={styles.socialButton}
                    >
                      <Text style={styles.socialButtonText}>
                        {photo.likedByMe ? 'Liked' : 'Like'} {photo.likeCount}
                      </Text>
                    </Pressable>
                    <Text style={styles.socialMeta}>
                      {photo.comments.length} comment{photo.comments.length === 1 ? '' : 's'}
                    </Text>
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
          <View style={styles.topBar}>
            <Pressable onPress={() => setStep('welcome')} style={styles.backButton}>
              <Ionicons color={theme.colors.textPrimary} name="chevron-back" size={24} />
            </Pressable>
            <Text style={styles.screenTitle}>
              {step === 'create' ? 'Create Your Shindig' : 'Invite Friends'}
            </Text>
            <View style={styles.topSpacer} />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {step === 'create' ? (
            <View style={styles.panel}>
              <Text style={styles.fieldLabel}>Photos*</Text>
              <Text style={styles.fieldLabel}>Shindig Name*</Text>
              <TextInput
                onChangeText={setShindigName}
                placeholder="Give this ShinDig a name"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                value={shindigName}
              />

              <Text style={[styles.fieldLabel, styles.spacedLabel]}>Photos*</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.photoRow}>
                  <Pressable onPress={handlePickFromLibrary} style={styles.addPhotoCard}>
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

              <Text style={styles.fieldCaption}>Choose Photo Source</Text>
              <View style={styles.photoSourceRow}>
                <Pressable onPress={handleTakePhoto} style={styles.sourceButton}>
                  <Text style={styles.sourceButtonText}>Take Photo</Text>
                </Pressable>
                <Pressable onPress={handlePickFromLibrary} style={styles.sourceButton}>
                  <Text style={styles.sourceButtonText}>Select From Library</Text>
                </Pressable>
              </View>

              <Text style={styles.fieldLabel}>Starting Location*</Text>
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

              <Pressable onPress={continueToInvite} style={styles.ctaButton}>
                <Text style={styles.ctaButtonText}>Continue</Text>
              </Pressable>
            </View>
          ) : null}

          {step === 'invite' ? (
            <View style={styles.panel}>
              <Text style={styles.inviteSubtitle}>
                Invite friends if you want. You can also skip this step and start the feed now.
              </Text>
              <TextInput
                onChangeText={setContactSearch}
                placeholder="Search contacts..."
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                value={contactSearch}
              />
              {isLoadingContacts ? <Text style={styles.helperText}>Loading contacts...</Text> : null}
              {!isLoadingContacts && contacts.length === 0 ? (
                <Text style={styles.helperText}>
                  No contacts selected. You can continue without inviting anyone.
                </Text>
              ) : null}

              <View style={styles.contactList}>
                {filteredContacts.map((contact) => {
                  const isSelected = selectedContactIds.includes(contact.id);
                  return (
                    <Pressable
                      key={contact.id}
                      onPress={() => toggleContact(contact.id)}
                      style={styles.contactItem}
                    >
                      <View style={[styles.contactCheckbox, isSelected && styles.contactCheckboxActive]}>
                        <Text style={styles.contactCheckboxText}>{isSelected ? 'x' : ''}</Text>
                      </View>
                      <View style={styles.contactCopy}>
                        <Text style={styles.contactName}>{contact.name}</Text>
                        <Text style={styles.contactPhone}>{contact.phoneNumber}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                disabled={isSavingShindig}
                onPress={saveShindigAndOpenFeed}
                style={[styles.ctaButton, isSavingShindig && styles.buttonDisabled]}
              >
                <Text style={styles.ctaButtonText}>
                  {isSavingShindig
                    ? 'Starting...'
                    : selectedContacts.length > 0
                      ? `Invite ${selectedContacts.length} Friends`
                      : 'Start Feed'}
                </Text>
              </Pressable>
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
    paddingTop: 72,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  topSpacer: {
    width: 40,
  },
  backButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginLeft: -10,
    width: 44,
  },
  avatarButton: {
    borderColor: theme.colors.border,
    borderRadius: theme.radius.round,
    borderWidth: 2,
    padding: 2,
  },
  avatar: {
    borderRadius: theme.radius.round,
    height: 52,
    width: 52,
  },
  ctaButton: {
    alignItems: 'center',
    backgroundColor: '#FF615A',
    borderRadius: theme.radius.round,
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
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
    fontSize: 20,
    fontWeight: '700',
  },
  pastList: {
    gap: theme.spacing.sm,
  },
  pastCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
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
  emptyText: {
    color: theme.colors.textMuted,
    lineHeight: 22,
  },
  screenTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
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
  fieldCaption: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  photoRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  addPhotoCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: '#FF615A',
    borderRadius: theme.radius.lg,
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
  photoSourceRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  sourceButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flex: 1,
    paddingVertical: theme.spacing.lg,
  },
  sourceButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
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
    borderRadius: theme.radius.lg,
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
  contactList: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  contactItem: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingVertical: theme.spacing.sm,
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
    backgroundColor: '#FF615A',
    borderColor: '#FF615A',
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
  feedHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  feedStack: {
    gap: theme.spacing.lg,
    marginTop: theme.spacing.xl,
  },
  shindigSocialCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    marginTop: theme.spacing.lg,
    padding: theme.spacing.md,
  },
  feedCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
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
    borderRadius: theme.radius.lg,
    height: 240,
    marginTop: theme.spacing.sm,
    width: '100%',
  },
  photoCredit: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  socialRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  socialButton: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.round,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
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

