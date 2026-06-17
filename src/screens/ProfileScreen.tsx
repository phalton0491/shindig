import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  FlatList,
  ImageBackground,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AlbumCard } from '../components/AlbumCard';
import { ProfileHeader } from '../components/ProfileHeader';
import { albums, UserProfile } from '../data/mockProfile';
import { signOut } from '../lib/auth';
import { uploadProfileAvatarData } from '../lib/profiles';
import { theme } from '../theme';

const featuredAlbums = albums.slice(0, 3);

type ProfileScreenProps = {
  onBackHome: () => void;
  onProfileSaved: (profile: UserProfile) => Promise<UserProfile>;
  profile: UserProfile;
  userId: string;
};

export function ProfileScreen({
  onBackHome,
  onProfileSaved,
  profile,
  userId,
}: ProfileScreenProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(profile);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  useEffect(() => {
    setDraft(profile);
  }, [profile]);

  function updateField(field: keyof UserProfile, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function handleSave() {
    setIsSaving(true);
    setError('');

    try {
      const savedProfile = await onProfileSaved(draft);
      setDraft(savedProfile);
      setIsEditing(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to save profile.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePickAvatar() {
    setError('');
    setIsUploadingAvatar(true);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Photo library access is required to upload a profile picture.');
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        base64: true,
        mediaTypes: ['images'],
        quality: 0.8,
      });

      if (result.canceled || !result.assets[0]?.uri || !result.assets[0]?.base64) {
        return;
      }

      const asset = result.assets[0];
      const assetBase64 = asset.base64;
      if (!assetBase64) {
        return;
      }
      const extensionMatch = asset.uri.match(/\.(\w+)(?:\?|$)/);
      const fileExtension = extensionMatch?.[1]?.toLowerCase() || 'jpg';
      const publicUrl = await uploadProfileAvatarData({
        base64: assetBase64,
        contentType: asset.mimeType ?? `image/${fileExtension}`,
        fileExtension,
        userId,
      });
      setDraft((current) => ({ ...current, avatar: publicUrl }));
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to upload profile picture.'
      );
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  async function handleSignOut() {
    await signOut();
  }

  const activeProfile = isEditing ? draft : profile;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable onPress={onBackHome} style={styles.topButton}>
            <Text style={styles.topButtonText}>Home</Text>
          </Pressable>
          <Pressable onPress={handleSignOut} style={styles.topButton}>
            <Text style={styles.topButtonText}>Sign out</Text>
          </Pressable>
        </View>

        <ProfileHeader profile={activeProfile} />

        <View style={styles.editorCard}>
          <View style={styles.editorHeader}>
            <Text style={styles.editorTitle}>Profile details</Text>
            <Pressable
              onPress={() => {
                setDraft(profile);
                setIsEditing((current) => !current);
                setError('');
              }}
            >
              <Text style={styles.editorAction}>
                {isEditing ? 'Cancel' : 'Edit profile'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.formGrid}>
            <Pressable
              disabled={!isEditing || isUploadingAvatar}
              onPress={handlePickAvatar}
              style={[
                styles.avatarUploadButton,
                (!isEditing || isUploadingAvatar) && styles.inputReadonly,
              ]}
            >
              <Text style={styles.avatarUploadText}>
                {isUploadingAvatar ? 'Uploading photo...' : 'Upload profile photo'}
              </Text>
            </Pressable>
            <TextInput
              editable={isEditing}
              onChangeText={(value) => updateField('name', value)}
              placeholder="Full name"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, !isEditing && styles.inputReadonly]}
              value={draft.name}
            />
            <TextInput
              editable={isEditing}
              onChangeText={(value) => updateField('city', value)}
              placeholder="City"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, !isEditing && styles.inputReadonly]}
              value={draft.city}
            />
            <TextInput
              editable={isEditing}
              onChangeText={(value) => updateField('bio', value)}
              multiline
              placeholder="Bio"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, styles.bioInput, !isEditing && styles.inputReadonly]}
              value={draft.bio}
            />
            <TextInput
              editable={isEditing}
              onChangeText={(value) => updateField('avatar', value)}
              placeholder="Profile photo URL"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, !isEditing && styles.inputReadonly]}
              value={draft.avatar}
            />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {isEditing ? (
            <Pressable
              disabled={isSaving}
              onPress={handleSave}
              style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            >
              <Text style={styles.saveButtonText}>Save changes</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Outings</Text>
            <Text style={styles.sectionAction}>View all</Text>
          </View>

          <FlatList
            contentContainerStyle={styles.featuredList}
            data={featuredAlbums}
            horizontal
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ImageBackground
                imageStyle={styles.featuredImage}
                source={{ uri: item.coverPhoto }}
                style={styles.featuredCard}
              >
                <View style={styles.featuredOverlay}>
                  <Text style={styles.featuredLabel}>{item.moment}</Text>
                  <Text style={styles.featuredTitle}>{item.title}</Text>
                  <Text style={styles.featuredMeta}>
                    {item.location} / {item.photoCount} photos
                  </Text>
                </View>
              </ImageBackground>
            )}
            showsHorizontalScrollIndicator={false}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Album Archive</Text>
            <Text style={styles.archiveCount}>{albums.length} drops</Text>
          </View>

          <View style={styles.grid}>
            {albums.map((album) => (
              <AlbumCard album={album} key={album.id} />
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingBottom: theme.spacing.xxxl,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  topButton: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.round,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  topButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  editorCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.lg,
    padding: theme.spacing.lg,
  },
  editorHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  editorTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  editorAction: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  formGrid: {
    gap: theme.spacing.sm,
  },
  input: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    color: theme.colors.textPrimary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  inputReadonly: {
    opacity: 0.75,
  },
  avatarUploadButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    paddingVertical: theme.spacing.md,
  },
  avatarUploadText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  bioInput: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  errorText: {
    color: '#FF9F8A',
    marginTop: theme.spacing.sm,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.lg,
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  saveButtonDisabled: {
    opacity: 0.65,
  },
  saveButtonText: {
    color: '#20140F',
    fontSize: 15,
    fontWeight: '800',
  },
  section: {
    marginTop: theme.spacing.xl,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  sectionAction: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  archiveCount: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  featuredList: {
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  featuredCard: {
    height: 218,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    width: 280,
  },
  featuredImage: {
    borderRadius: theme.radius.xl,
  },
  featuredOverlay: {
    backgroundColor: 'rgba(10, 14, 26, 0.45)',
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
  },
  featuredLabel: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: theme.spacing.xs,
    textTransform: 'uppercase',
  },
  featuredTitle: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.8,
    marginBottom: theme.spacing.xs,
  },
  featuredMeta: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
});
