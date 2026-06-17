import {
  Image,
  ImageBackground,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { albums, feedMoments, UserProfile } from '../data/mockProfile';
import { theme } from '../theme';

type HomeScreenProps = {
  onOpenProfile: () => void;
  profile: UserProfile;
};

export function HomeScreen({ onOpenProfile, profile }: HomeScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <View>
            <Text style={styles.greeting}>Welcome back</Text>
            <Text style={styles.name}>{profile.name}</Text>
          </View>

          <Pressable onPress={onOpenProfile} style={styles.avatarButton}>
            <Image source={{ uri: profile.avatar }} style={styles.avatar} />
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Tonight's pulse</Text>
          <Text style={styles.heroTitle}>Your feed is ready.</Text>
          <Text style={styles.heroCopy}>
            Jump into recent drops from friends, relive saved moments, and keep
            your own profile stacked with nights and days.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Feed</Text>
          <View style={styles.feedStack}>
            {feedMoments.map((moment) => (
              <View key={moment.id} style={styles.feedCard}>
                <View style={styles.feedHeader}>
                  <Text style={styles.feedAuthor}>{moment.author}</Text>
                  <Text style={styles.feedTime}>{moment.timestamp}</Text>
                </View>
                <Text style={styles.feedHeadline}>{moment.headline}</Text>
                <Text style={styles.feedCaption}>{moment.caption}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your recent drops</Text>
          <View style={styles.albumStrip}>
            {albums.slice(0, 2).map((album) => (
              <ImageBackground
                imageStyle={styles.albumImage}
                key={album.id}
                source={{ uri: album.coverPhoto }}
                style={styles.albumCard}
              >
                <View style={styles.albumOverlay}>
                  <Text style={styles.albumMoment}>{album.moment}</Text>
                  <Text style={styles.albumTitle}>{album.title}</Text>
                </View>
              </ImageBackground>
            ))}
          </View>
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
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  greeting: {
    color: theme.colors.textMuted,
    fontSize: 14,
    marginBottom: 4,
  },
  name: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.8,
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
  heroCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    marginTop: theme.spacing.xl,
    padding: theme.spacing.lg,
  },
  heroLabel: {
    color: theme.colors.accentSoft,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: theme.colors.textPrimary,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.9,
    marginTop: theme.spacing.sm,
  },
  heroCopy: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: theme.spacing.sm,
  },
  section: {
    marginTop: theme.spacing.xl,
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: theme.spacing.md,
  },
  feedStack: {
    gap: theme.spacing.md,
  },
  feedCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    padding: theme.spacing.lg,
  },
  feedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  feedAuthor: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  feedTime: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  feedHeadline: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginTop: theme.spacing.sm,
  },
  feedCaption: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: theme.spacing.sm,
  },
  albumStrip: {
    gap: theme.spacing.md,
  },
  albumCard: {
    height: 180,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  albumImage: {
    borderRadius: theme.radius.xl,
  },
  albumOverlay: {
    backgroundColor: 'rgba(10, 14, 26, 0.45)',
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
  },
  albumMoment: {
    color: theme.colors.accentSoft,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  albumTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginTop: theme.spacing.xs,
  },
});
