import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  Image,
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
import { signOut } from '../lib/auth';
import { uploadProfileAvatarData } from '../lib/profiles';
import { theme } from '../theme';
import { SavedShindig, UserProfile } from '../types/models';

type ProfileScreenProps = {
  onBackHome: () => void;
  onOpenShindig: (shindig: SavedShindig) => void;
  onProfileSaved: (profile: UserProfile) => Promise<UserProfile>;
  profile: UserProfile;
  shindigs: SavedShindig[];
  userId: string;
};

export function ProfileScreen({
  onBackHome,
  onOpenShindig,
  onProfileSaved,
  profile,
  shindigs,
  userId,
}: ProfileScreenProps) {
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
      const extensionMatch = asset.uri.match(/\.(\w+)(?:\?|$)/);
      const publicUrl = await uploadProfileAvatarData({
        base64: asset.base64!,
        contentType: asset.mimeType ?? `image/${extensionMatch?.[1]?.toLowerCase() || 'jpg'}`,
        fileExtension: extensionMatch?.[1]?.toLowerCase() || 'jpg',
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable onPress={onBackHome} style={styles.topButton}>
            <Text style={styles.topButtonText}>Home</Text>
          </Pressable>
          <Pressable onPress={handleSignOut} style={styles.topButton}>
            <Text style={styles.topButtonText}>Sign out</Text>
          </Pressable>
        </View>

        <ProfileHeader profile={draft} />

        <View style={styles.editorCard}>
          <Text style={styles.editorTitle}>Profile details</Text>

          <View style={styles.formGrid}>
            <Pressable
              disabled={isUploadingAvatar}
              onPress={handlePickAvatar}
              style={[styles.avatarUploadButton, isUploadingAvatar && styles.inputReadonly]}
            >
              <Text style={styles.avatarUploadText}>
                {isUploadingAvatar ? 'Uploading photo...' : 'Upload profile photo'}
              </Text>
            </Pressable>
            <TextInput
              onChangeText={(value) => updateField('name', value)}
              placeholder="Full name"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={draft.name}
            />
            <TextInput
              onChangeText={(value) => updateField('city', value)}
              placeholder="City"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={draft.city}
            />
            <TextInput
              multiline
              onChangeText={(value) => updateField('bio', value)}
              placeholder="Bio"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, styles.bioInput]}
              value={draft.bio}
            />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            disabled={isSaving}
            onPress={handleSave}
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          >
            <Text style={styles.saveButtonText}>Save changes</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your ShinDigs</Text>
            <Text style={styles.archiveCount}>{shindigs.length} saved</Text>
          </View>

          {shindigs.length > 0 ? (
            <View style={styles.grid}>
              {shindigs.map((shindig) => (
                <Pressable
                  key={shindig.id}
                  onPress={() => onOpenShindig(shindig)}
                  style={styles.albumTile}
                >
                  <AlbumCard shindig={shindig} />
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>
              Your saved ShinDigs will appear here after you plan and save one.
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: theme.colors.background,
    flex: 1,
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
  editorTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: theme.spacing.md,
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
  archiveCount: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  albumTile: {
    maxWidth: 260,
    minWidth: 160,
    width: '47%',
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    paddingHorizontal: theme.spacing.lg,
  },
});
