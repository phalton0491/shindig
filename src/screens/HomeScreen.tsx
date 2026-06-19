import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import * as Contacts from 'expo-contacts';
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
import { theme } from '../theme';
import { SavedShindig, TimelinePlace, UserProfile } from '../types/models';

type HomeScreenProps = {
  onOpenProfile: () => void;
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

const HERO_LOGO = require('../../assets/auth-logo.png');
const INVITE_SIGNUP_URL = 'shindig://signup';

function formatDateLabel(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function fileExtensionFromUri(uri: string) {
  return uri.match(/\.(\w+)(?:\?|$)/)?.[1]?.toLowerCase() || 'jpg';
}

export function HomeScreen({
  onOpenProfile,
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
  const deferredLocationQuery = useDeferredValue(locationQuery);
  const deferredContactSearch = useDeferredValue(contactSearch);

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

    async function runLocationSearch() {
      const query = deferredLocationQuery.trim();
      if (query.length < 2 || selectedLocation?.title === locationQuery.trim()) {
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
          query,
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
  }, [currentLocation, deferredLocationQuery, locationHint, locationQuery, selectedLocation]);

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
          setError('Contacts permission is required to invite friends.');
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

        if (results.length === 0) {
          setError('Could not resolve that address or place. Try a more specific location.');
          return;
        }

        setSelectedLocation(results[0]);
        setLocationQuery(results[0].title);
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Could not resolve that address or place right now.'
        );
        return;
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
    if (!selectedLocation) {
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
          `${profile.name} invited you to ${inviteName} at ${selectedLocation.title}. Sign up to join the ShinDig: ${INVITE_SIGNUP_URL}`
        );
      }

      const savedShindig = await onShindigSaved({
        stops: [
          {
            photos,
            place: selectedLocation,
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

  if (step === 'welcome') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <View />
            <Pressable onPress={onOpenProfile} style={styles.avatarButton}>
              <Image source={{ uri: profile.avatar }} style={styles.avatar} />
            </Pressable>
          </View>

          <View style={styles.welcomeCard}>
            <Image source={HERO_LOGO} style={styles.heroLogo} />
            <Text style={styles.welcomeTitle}>Make memories with the people who were there.</Text>
            <Pressable onPress={goToCreate} style={styles.ctaButton}>
              <Text style={styles.ctaButtonText}>Start a Shindig</Text>
            </Pressable>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Past Shindigs</Text>
          </View>

          {shindigs.length > 0 ? (
            <View style={styles.pastList}>
              {shindigs.map((shindig) => (
                <View key={shindig.id} style={styles.pastCard}>
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
                </View>
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
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.feedHeader}>
            <View>
              <Text style={styles.feedLocation}>{activeFeedShindig.stops[0]?.place.title}</Text>
              <Text style={styles.feedParticipants}>
                {selectedContacts.length + 1} participants
              </Text>
            </View>
            <Pressable onPress={onOpenProfile} style={styles.avatarButton}>
              <Image source={{ uri: profile.avatar }} style={styles.avatar} />
            </Pressable>
          </View>

          <View style={styles.feedStack}>
            {feedPhotos.map((photo) => (
              <View key={photo.id} style={styles.feedCard}>
                <View style={styles.feedCardHeader}>
                  <Text style={styles.feedAuthor}>{profile.name}</Text>
                  <Text style={styles.feedTime}>Just now</Text>
                </View>
                <Image source={{ uri: photo.photoUrl }} style={styles.feedPhoto} />
              </View>
            ))}
          </View>
        </ScrollView>
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
            <Pressable onPress={() => setStep('welcome')}>
              <Text style={styles.backText}>Back</Text>
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
                }}
                placeholder="Search address"
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
              </View>

              <Pressable onPress={continueToInvite} style={styles.ctaButton}>
                <Text style={styles.ctaButtonText}>Continue</Text>
              </Pressable>
            </View>
          ) : null}

          {step === 'invite' ? (
            <View style={styles.panel}>
              <Text style={styles.inviteSubtitle}>
                People you invite can upload photos and see everyone else&apos;s pictures.
              </Text>
              <TextInput
                onChangeText={setContactSearch}
                placeholder="Search contacts..."
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                value={contactSearch}
              />
              {isLoadingContacts ? <Text style={styles.helperText}>Loading contacts...</Text> : null}

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
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  topSpacer: {
    width: 40,
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
  welcomeCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    marginTop: theme.spacing.lg,
    padding: theme.spacing.xl,
  },
  heroLogo: {
    height: 240,
    resizeMode: 'contain',
    width: 240,
  },
  welcomeTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    lineHeight: 28,
    marginTop: theme.spacing.lg,
    maxWidth: 260,
    textAlign: 'center',
  },
  ctaButton: {
    alignItems: 'center',
    backgroundColor: '#FF615A',
    borderRadius: theme.radius.round,
    marginTop: theme.spacing.xl,
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
  backText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
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
  feedCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    padding: theme.spacing.md,
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
  feedTime: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  feedPhoto: {
    borderRadius: theme.radius.lg,
    height: 240,
    width: '100%',
  },
});
