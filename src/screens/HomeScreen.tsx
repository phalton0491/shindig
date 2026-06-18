import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import {
  Image,
  Keyboard,
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
      photos: DraftStopPhoto[];
      place: TimelinePlace;
      scheduledTime?: string;
    }[];
    userId: string;
  }) => Promise<SavedShindig>;
  profile: UserProfile;
  userId: string;
};

type PlannerStep = 'places' | 'review' | 'timeline' | 'map';

type DraftStopPhoto = {
  base64: string;
  contentType?: string;
  fileExtension?: string;
  localUri: string;
};

const APP_MARK = require('../../assets/android-icon-foreground.png');

function buildTimeline(stops: TimelinePlace[]) {
  const startHour = 20;
  const startMinute = 0;

  return stops.map((stop, index) => {
    const minutesBeforeStop = stops
      .slice(0, index)
      .reduce((total, current, currentIndex) => {
        const stopMinutes = current.durationLabel.includes('2+')
          ? 120
          : current.durationLabel.includes('1 hr 45')
            ? 105
            : current.durationLabel.includes('1 hr 30')
              ? 90
              : current.durationLabel.includes('1 hr 20')
                ? 80
                : 70;
        const transitMinutes =
          currentIndex < stops.length - 1 ? current.transitMinutes : 0;

        return total + stopMinutes + transitMinutes;
      }, 0);

    const totalMinutes = startHour * 60 + startMinute + minutesBeforeStop;
    const hour24 = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    const period = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = ((hour24 + 11) % 12) + 1;
    const timeLabel = `${hour12}:${minute.toString().padStart(2, '0')} ${period}`;

    return {
      ...stop,
      timeLabel,
    };
  });
}

function summaryDistance(stops: TimelinePlace[]) {
  return stops
    .slice(0, Math.max(stops.length - 1, 0))
    .reduce((total, stop) => total + stop.transitMiles, 0);
}

export function HomeScreen({
  onOpenProfile,
  onShindigSaved,
  profile,
  userId,
}: HomeScreenProps) {
  const [activeStep, setActiveStep] = useState<PlannerStep>('places');
  const [selectedStops, setSelectedStops] = useState<TimelinePlace[]>([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<TimelinePlace[]>([]);
  const [locationError, setLocationError] = useState('');
  const [searchError, setSearchError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmittingSearch, setIsSubmittingSearch] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isSavingShindig, setIsSavingShindig] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObjectCoords | null>(
    null
  );
  const [locationHint, setLocationHint] = useState('');
  const [stopPhotos, setStopPhotos] = useState<Record<string, DraftStopPhoto[]>>({});
  const deferredSearch = useDeferredValue(search);
  const searchRequestIdRef = useRef(0);

  const suggestedPlaces = useMemo(() => searchResults, [searchResults]);
  const timelineStops = useMemo(() => buildTimeline(selectedStops), [selectedStops]);
  const totalDistance = summaryDistance(selectedStops);
  const totalPhotoCount = Object.values(stopPhotos).reduce(
    (total, photos) => total + photos.length,
    0
  );
  const stepIndex = ['places', 'review', 'timeline', 'map'].indexOf(activeStep) + 1;

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setIsKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadCurrentLocation() {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!isMounted) {
          return;
        }

        if (permission.status !== 'granted') {
          setLocationError('Location permission was denied. Search still works without it.');
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
      } catch (error) {
        if (isMounted) {
          setLocationError(
            error instanceof Error
              ? error.message
              : 'Unable to determine your location right now.'
          );
        }
      }
    }

    loadCurrentLocation();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    async function runSearch() {
      const trimmedSearch = deferredSearch.trim();
      const requestId = ++searchRequestIdRef.current;

      if (trimmedSearch.length < 2) {
        setSearchResults([]);
        setSearchError('');
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      setSearchError('');

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
          query: trimmedSearch,
        });

        if (searchRequestIdRef.current === requestId) {
          setSearchResults(results);
        }
      } catch (error) {
        if (searchRequestIdRef.current === requestId) {
          setSearchError(
            error instanceof Error ? error.message : 'Could not search places right now.'
          );
        }
      } finally {
        if (searchRequestIdRef.current === requestId) {
          setIsSearching(false);
        }
      }
    }

    runSearch();
  }, [currentLocation, deferredSearch, locationHint]);

  useEffect(() => {
    if (activeStep === 'review' && selectedStops.length === 0) {
      setActiveStep('places');
    }
    if (activeStep === 'timeline' && selectedStops.length < 2) {
      setActiveStep('review');
    }
    if (activeStep === 'map' && selectedStops.length < 2) {
      setActiveStep('timeline');
    }
  }, [activeStep, selectedStops.length]);

  async function handleSubmittedSearch() {
    const trimmedSearch = search.trim();
    const requestId = ++searchRequestIdRef.current;

    if (trimmedSearch.length < 2) {
      setSearchResults([]);
      setSearchError('');
      return;
    }

    setIsSubmittingSearch(true);
    setSearchError('');

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
        query: trimmedSearch,
      });

      if (searchRequestIdRef.current === requestId) {
        setSearchResults(results);
      }
    } catch (error) {
      if (searchRequestIdRef.current === requestId) {
        setSearchError(
          error instanceof Error ? error.message : 'Could not search places right now.'
        );
      }
    } finally {
      if (searchRequestIdRef.current === requestId) {
        setIsSubmittingSearch(false);
      }
    }
  }

  function togglePlace(place: TimelinePlace) {
    setSelectedStops((current) => {
      if (current.some((item) => item.id === place.id)) {
        return current.filter((item) => item.id !== place.id);
      }

      return [...current, place];
    });
  }

  function moveStop(index: number, direction: 'up' | 'down') {
    setSelectedStops((current) => {
      const next = [...current];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;

      if (targetIndex < 0 || targetIndex >= next.length) {
        return current;
      }

      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  async function handlePickStopPhotos(stopId: string) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setSearchError('Photo library access is required to attach stop photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      base64: true,
      mediaTypes: ['images'],
      quality: 0.8,
      selectionLimit: 6,
    });

    if (result.canceled) {
      return;
    }

    const photos = result.assets
      .filter((asset) => asset.base64 && asset.uri)
      .map<DraftStopPhoto>((asset) => {
        const extensionMatch = asset.uri.match(/\.(\w+)(?:\?|$)/);
        return {
          base64: asset.base64!,
          contentType: asset.mimeType,
          fileExtension: extensionMatch?.[1]?.toLowerCase() || 'jpg',
          localUri: asset.uri,
        };
      });

    setStopPhotos((current) => ({
      ...current,
      [stopId]: [...(current[stopId] || []), ...photos],
    }));
  }

  async function handleSaveShindig() {
    setIsSavingShindig(true);
    setSearchError('');

    try {
      await onShindigSaved({
        stops: timelineStops.map((stop) => ({
          photos: stopPhotos[stop.id] || [],
          place: stop,
          scheduledTime: stop.timeLabel,
        })),
        userId,
      });
      setSelectedStops([]);
      setStopPhotos({});
      setSearch('');
      setSearchResults([]);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Failed to save ShinDig.');
    } finally {
      setIsSavingShindig(false);
    }
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
            <View style={styles.brandRow}>
              <Image source={APP_MARK} style={styles.brandMark} />
              <Text style={styles.brandText}>SHINDIG</Text>
            </View>

            <Pressable onPress={onOpenProfile} style={styles.avatarButton}>
              <Image source={{ uri: profile.avatar }} style={styles.avatar} />
            </Pressable>
          </View>

          <View style={[styles.stepRow, isKeyboardVisible && styles.stepRowCompact]}>
            {[
              { id: 'places', label: 'Add Places' },
              { id: 'review', label: 'Review Stops' },
              { id: 'timeline', label: 'View Timeline' },
              { id: 'map', label: 'Save ShinDig' },
            ].map((step, index) => {
              const isActive = step.id === activeStep;
              const isComplete = index + 1 < stepIndex;

              return (
                <View key={step.id} style={styles.stepItem}>
                  <View
                    style={[
                      styles.stepBadge,
                      isActive && styles.stepBadgeActive,
                      isComplete && styles.stepBadgeComplete,
                    ]}
                  >
                    <Text style={styles.stepBadgeText}>{index + 1}</Text>
                  </View>
                  {!isKeyboardVisible ? (
                    <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>
                      {step.label}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>

          {activeStep === 'places' ? (
            <View style={[styles.sectionCard, isKeyboardVisible && styles.sectionCardTight]}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Add locations</Text>
                  <Text style={styles.sectionSubtitle}>
                    Search nearby places and build your next ShinDig.
                  </Text>
                </View>
              </View>

              <View style={styles.searchRow}>
                <TextInput
                  onChangeText={setSearch}
                  onSubmitEditing={handleSubmittedSearch}
                  placeholder="Search for a real place"
                  placeholderTextColor={theme.colors.textMuted}
                  returnKeyType="search"
                  style={styles.searchInput}
                  value={search}
                />
                <Pressable onPress={handleSubmittedSearch} style={styles.searchButton}>
                  <Text style={styles.searchButtonText}>Search</Text>
                </Pressable>
              </View>

              {locationError ? <Text style={styles.inlineNote}>{locationError}</Text> : null}
              {searchError ? <Text style={styles.inlineError}>{searchError}</Text> : null}
              {isSearching ? <Text style={styles.inlineNote}>Searching nearby places...</Text> : null}
              {isSubmittingSearch ? (
                <Text style={styles.inlineNote}>Running a deeper location search...</Text>
              ) : null}

              <View style={styles.placeList}>
                {suggestedPlaces.map((place) => {
                  const isAdded = selectedStops.some((item) => item.id === place.id);

                  return (
                    <View key={place.id} style={styles.placeCard}>
                      <View style={styles.placeImageFallback}>
                        <Text style={styles.placeImageFallbackText}>
                          {place.title.slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.placeCopy}>
                        <Text style={styles.placeTitle}>{place.title}</Text>
                        <Text style={styles.placeMeta}>
                          {place.type}
                          {typeof place.distanceMiles === 'number'
                            ? ` . ${place.distanceMiles.toFixed(1)} mi`
                            : ''}
                        </Text>
                        <Text style={styles.placeAddress}>{place.address}</Text>
                      </View>
                      <Pressable
                        onPress={() => togglePlace(place)}
                        style={[styles.addButton, isAdded && styles.addButtonActive]}
                      >
                        <Text
                          style={[
                            styles.addButtonText,
                            isAdded && styles.addButtonTextActive,
                          ]}
                        >
                          {isAdded ? 'Added' : 'Add'}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
                {!isSearching && search.trim().length >= 2 && searchResults.length === 0 ? (
                  <Text style={styles.inlineNote}>
                    No fast match yet. Press search to run a deeper lookup.
                  </Text>
                ) : null}
                {search.trim().length < 2 ? (
                  <Text style={styles.inlineNote}>
                    Start typing at least 2 letters to see nearby place matches.
                  </Text>
                ) : null}
              </View>

              <View style={styles.footerBar}>
                <Text style={styles.footerText}>{selectedStops.length} added</Text>
                <Pressable
                  disabled={selectedStops.length === 0}
                  onPress={() => setActiveStep('review')}
                  style={[
                    styles.primaryButton,
                    selectedStops.length === 0 && styles.buttonDisabled,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>Review list</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {activeStep === 'review' ? (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Your stops</Text>
                  <Text style={styles.sectionSubtitle}>
                    Reorder the route and attach photos for each place.
                  </Text>
                </View>
                <Pressable onPress={() => setActiveStep('places')}>
                  <Text style={styles.headerAction}>Edit list</Text>
                </Pressable>
              </View>

              <View style={styles.placeList}>
                {selectedStops.map((place, index) => (
                  <View key={place.id} style={styles.reviewCard}>
                    <View style={styles.stopCard}>
                      <View style={styles.stopIndex}>
                        <Text style={styles.stopIndexText}>{index + 1}</Text>
                      </View>
                      <View style={styles.stopImageFallback}>
                        <Text style={styles.placeImageFallbackText}>
                          {place.title.slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.stopCopy}>
                        <Text style={styles.placeTitle}>{place.title}</Text>
                        <Text style={styles.placeMeta}>{place.type} . {place.address}</Text>
                      </View>
                      <View style={styles.stopActions}>
                        <Pressable
                          onPress={() => moveStop(index, 'up')}
                          style={styles.orderButton}
                        >
                          <Text style={styles.orderButtonText}>Up</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => moveStop(index, 'down')}
                          style={styles.orderButton}
                        >
                          <Text style={styles.orderButtonText}>Down</Text>
                        </Pressable>
                      </View>
                    </View>

                    <Pressable
                      onPress={() => handlePickStopPhotos(place.id)}
                      style={styles.photoAttachButton}
                    >
                      <Text style={styles.photoAttachButtonText}>
                        Upload photos for this stop
                      </Text>
                    </Pressable>

                    {(stopPhotos[place.id] || []).length > 0 ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={styles.photoStrip}>
                          {(stopPhotos[place.id] || []).map((photo) => (
                            <Image
                              key={photo.localUri}
                              source={{ uri: photo.localUri }}
                              style={styles.photoThumb}
                            />
                          ))}
                        </View>
                      </ScrollView>
                    ) : (
                      <Text style={styles.inlineNote}>
                        No photos attached to this stop yet.
                      </Text>
                    )}
                  </View>
                ))}
              </View>

              <Pressable
                disabled={selectedStops.length < 2}
                onPress={() => setActiveStep('timeline')}
                style={[
                  styles.primaryButton,
                  selectedStops.length < 2 && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.primaryButtonText}>Create timeline</Text>
              </Pressable>
              <Text style={styles.helperText}>
                {selectedStops.length > 0
                  ? `${selectedStops.length} stops selected / ${totalPhotoCount} photos attached`
                  : 'Add at least 2 stops to generate a timeline'}
              </Text>
            </View>
          ) : null}

          {activeStep === 'timeline' ? (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Your timeline</Text>
                  <Text style={styles.sectionSubtitle}>
                    Your route is sequenced and ready to save.
                  </Text>
                </View>
                <Pressable onPress={() => setActiveStep('review')}>
                  <Text style={styles.headerAction}>Edit stops</Text>
                </Pressable>
              </View>

              <View style={styles.timelineColumn}>
                {timelineStops.map((stop, index) => (
                  <View key={stop.id}>
                    <View style={styles.timelineRow}>
                      <View style={styles.timelineRail}>
                        <View style={styles.timelineNode} />
                        {index < timelineStops.length - 1 ? (
                          <View style={styles.timelineLine} />
                        ) : null}
                      </View>
                      <View style={styles.timelineCard}>
                        <View style={styles.timelineImageFallback}>
                          <Text style={styles.placeImageFallbackText}>
                            {stop.title.slice(0, 1).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.timelineCopy}>
                          <Text style={styles.timelineTime}>{stop.timeLabel}</Text>
                          <Text style={styles.placeTitle}>{stop.title}</Text>
                          <Text style={styles.placeMeta}>{stop.type}</Text>
                          <Text numberOfLines={1} style={styles.placeAddress}>
                            {stop.address}
                          </Text>
                          <Text style={styles.durationChip}>{stop.durationLabel}</Text>
                        </View>
                      </View>
                    </View>
                    {index < timelineStops.length - 1 ? (
                      <Text style={styles.transitLabel}>
                        {stop.transitMiles.toFixed(1)} mi . {stop.transitMinutes} min walk
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>

              <Pressable onPress={() => setActiveStep('map')} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Continue</Text>
              </Pressable>
            </View>
          ) : null}

          {activeStep === 'map' ? (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Save ShinDig</Text>
                  <Text style={styles.sectionSubtitle}>
                    This plan will be saved to your profile archive with all uploaded stop photos.
                  </Text>
                </View>
                <Pressable onPress={() => setActiveStep('timeline')}>
                  <Text style={styles.headerAction}>Timeline</Text>
                </Pressable>
              </View>

              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Stops</Text>
                  <Text style={styles.summaryValue}>{selectedStops.length}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Photos</Text>
                  <Text style={styles.summaryValue}>{totalPhotoCount}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Distance</Text>
                  <Text style={styles.summaryValue}>{totalDistance.toFixed(1)} mi</Text>
                </View>
              </View>

              <Pressable
                disabled={isSavingShindig}
                onPress={handleSaveShindig}
                style={[styles.primaryButton, isSavingShindig && styles.buttonDisabled]}
              >
                <Text style={styles.primaryButtonText}>
                  {isSavingShindig ? 'Saving...' : 'Save ShinDig'}
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
    paddingBottom: theme.spacing.xxxl,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  brandMark: {
    height: 32,
    width: 32,
  },
  brandText: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 1.2,
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
  stepRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  stepRowCompact: {
    marginTop: theme.spacing.md,
  },
  stepItem: {
    alignItems: 'center',
    flex: 1,
    gap: theme.spacing.xs,
  },
  stepBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.round,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  stepBadgeActive: {
    backgroundColor: '#8F5BFF',
    borderColor: '#8F5BFF',
  },
  stepBadgeComplete: {
    backgroundColor: '#5F8CFF',
    borderColor: '#5F8CFF',
  },
  stepBadgeText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  stepLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  stepLabelActive: {
    color: theme.colors.textPrimary,
  },
  sectionCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    marginTop: theme.spacing.lg,
    padding: theme.spacing.lg,
  },
  sectionCardTight: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  sectionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  sectionSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: theme.spacing.xs,
    maxWidth: 260,
  },
  headerAction: {
    color: '#B18CFF',
    fontSize: 14,
    fontWeight: '700',
  },
  searchRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  searchInput: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    color: theme.colors.textPrimary,
    flex: 1,
    minHeight: 52,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  searchButton: {
    alignItems: 'center',
    backgroundColor: '#8F5BFF',
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
    minWidth: 94,
    paddingHorizontal: theme.spacing.md,
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  inlineError: {
    color: '#FF9F8A',
    fontSize: 13,
    marginBottom: theme.spacing.sm,
  },
  inlineNote: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginBottom: theme.spacing.sm,
  },
  placeList: {
    gap: theme.spacing.sm,
  },
  placeCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    padding: theme.spacing.sm,
  },
  placeImageFallback: {
    alignItems: 'center',
    backgroundColor: '#2B3552',
    borderRadius: 14,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  placeImageFallbackText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  placeCopy: {
    flex: 1,
    marginLeft: theme.spacing.sm,
  },
  placeTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  placeMeta: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  placeAddress: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.round,
    minWidth: 68,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
  },
  addButtonActive: {
    backgroundColor: '#8F5BFF',
  },
  addButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  addButtonTextActive: {
    color: '#FFFFFF',
  },
  footerBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.lg,
  },
  footerText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#8F5BFF',
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  reviewCard: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    padding: theme.spacing.sm,
  },
  stopCard: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  stopIndex: {
    alignItems: 'center',
    backgroundColor: '#8F5BFF',
    borderRadius: theme.radius.round,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  stopIndexText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  stopImageFallback: {
    alignItems: 'center',
    backgroundColor: '#2B3552',
    borderRadius: 14,
    height: 54,
    justifyContent: 'center',
    marginLeft: theme.spacing.sm,
    width: 54,
  },
  stopCopy: {
    flex: 1,
    marginLeft: theme.spacing.sm,
  },
  stopActions: {
    gap: theme.spacing.xs,
  },
  orderButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  orderButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  photoAttachButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  photoAttachButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  photoStrip: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  photoThumb: {
    borderRadius: 12,
    height: 72,
    width: 72,
  },
  helperText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  timelineColumn: {
    gap: theme.spacing.sm,
  },
  timelineRow: {
    flexDirection: 'row',
  },
  timelineRail: {
    alignItems: 'center',
    marginRight: theme.spacing.sm,
    width: 20,
  },
  timelineNode: {
    backgroundColor: '#8F5BFF',
    borderRadius: theme.radius.round,
    height: 16,
    marginTop: 12,
    width: 16,
  },
  timelineLine: {
    backgroundColor: '#8F5BFF',
    flex: 1,
    marginTop: 4,
    width: 2,
  },
  timelineCard: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    padding: theme.spacing.sm,
  },
  timelineImageFallback: {
    alignItems: 'center',
    backgroundColor: '#2B3552',
    borderRadius: 14,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  timelineCopy: {
    flex: 1,
    marginLeft: theme.spacing.sm,
  },
  timelineTime: {
    color: '#B18CFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  durationChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: theme.radius.round,
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: theme.spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  transitLabel: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginBottom: theme.spacing.sm,
    marginLeft: 30,
    marginTop: theme.spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  summaryCard: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flex: 1,
    padding: theme.spacing.md,
  },
  summaryLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  summaryValue: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginTop: theme.spacing.sm,
  },
});
