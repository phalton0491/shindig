import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AlbumCard } from '../components/AlbumCard';
import { PageHeader } from '../components/PageHeader';
import { ProfileHeader } from '../components/ProfileHeader';
import { theme } from '../theme';
import { SavedShindig, UserProfile } from '../types/models';

type FriendProfileScreenProps = {
  headerActions?: React.ReactNode;
  onBack: () => void;
  onOpenFriends: () => void;
  onOpenShindig: (shindig: SavedShindig) => void;
  profile: UserProfile;
  shindigs: SavedShindig[];
};

export function FriendProfileScreen({
  headerActions,
  onBack,
  onOpenFriends,
  onOpenShindig,
  profile,
  shindigs,
}: FriendProfileScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PageHeader onBack={onBack} right={headerActions} />

        <ProfileHeader onOpenFriends={onOpenFriends} profile={profile} />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{`${profile.name.split(' ')[0]}'s ShinDigs`}</Text>
            <Text style={styles.archiveCount}>{shindigs.length} shindigs</Text>
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
            <Text style={styles.emptyText}>No public ShinDigs to show yet.</Text>
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
    paddingTop: 28,
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
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  archiveCount: {
    color: theme.colors.accentSoft,
    fontSize: 13,
    fontWeight: '700',
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
