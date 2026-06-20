import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AlbumCard } from '../components/AlbumCard';
import { ProfileHeader } from '../components/ProfileHeader';
import { theme } from '../theme';
import { SavedShindig, UserProfile } from '../types/models';

type ProfileScreenProps = {
  onBackHome: () => void;
  onOpenShindig: (shindig: SavedShindig) => void;
  profile: UserProfile;
  shindigs: SavedShindig[];
};

export function ProfileScreen({
  onBackHome,
  onOpenShindig,
  profile,
  shindigs,
}: ProfileScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable onPress={onBackHome} style={styles.topButton}>
            <Ionicons color={theme.colors.textPrimary} name="chevron-back" size={28} />
          </Pressable>
        </View>

        <ProfileHeader profile={profile} />

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
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  topButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    height: 52,
    justifyContent: 'center',
    marginLeft: -14,
    width: 52,
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
