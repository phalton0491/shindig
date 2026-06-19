import { ImageBackground, StyleSheet, Text, View } from 'react-native';

import { SavedShindig } from '../types/models';
import { theme } from '../theme';

type AlbumCardProps = {
  shindig: SavedShindig;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
  });
}

export function AlbumCard({ shindig }: AlbumCardProps) {
  const fallbackPhoto =
    'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1200&q=80';
  const stopSummary = shindig.stops.map((stop) => stop.place.title).join(' / ');

  return (
    <ImageBackground
      imageStyle={styles.image}
      source={{ uri: shindig.coverPhotoUrl || fallbackPhoto }}
      style={styles.card}
    >
      <View style={styles.overlay}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>ShinDig</Text>
        </View>
        <Text style={styles.title}>{shindig.title}</Text>
        <Text style={styles.meta}>
          {formatDate(shindig.createdAt)} / {shindig.photoCount} photos
        </Text>
        <Text numberOfLines={2} style={styles.vibe}>
          {stopSummary}
        </Text>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    height: 240,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    width: '100%',
  },
  image: {
    borderRadius: theme.radius.lg,
  },
  overlay: {
    backgroundColor: 'rgba(8, 11, 22, 0.58)',
    borderRadius: theme.radius.lg,
    minHeight: '48%',
    padding: theme.spacing.md,
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 138, 91, 0.92)',
    borderRadius: theme.radius.round,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  pillText: {
    color: '#20140F',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  meta: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: theme.spacing.xs,
  },
  vibe: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: theme.spacing.sm,
  },
});
