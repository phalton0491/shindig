import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { uploadProfileAvatarData } from '../lib/profiles';
import { theme } from '../theme';
import { UserProfile } from '../types/models';

type SettingsScreenProps = {
  onProfileSaved: (profile: UserProfile) => Promise<UserProfile>;
  profile: UserProfile;
  userId: string;
};

export function SettingsScreen({
  onProfileSaved,
  profile,
  userId,
}: SettingsScreenProps) {
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.panel}>
          <Text style={styles.title}>User settings</Text>
          <Text style={styles.subtitle}>Update your photo and profile details.</Text>

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
            <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save changes'}</Text>
          </Pressable>
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
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxxl,
    paddingTop: 76,
  },
  panel: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    padding: theme.spacing.lg,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    marginTop: theme.spacing.sm,
  },
  formGrid: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
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
});
