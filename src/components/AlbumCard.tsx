import { StyleSheet, Text, View } from 'react-native';

import { ProgressiveImage } from './ProgressiveImage';
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
    <ProgressiveImage
      containerStyle={styles.card}
      imageStyle={styles.image}
      resizeMode="contain"
      sourceUri={shindig.coverPhotoThumbnailUrl || shindig.coverPhotoUrl || fallbackPhoto}
    >
      <View style={styles.topGlow} />
      <View style={styles.overlay}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>ShinDig</Text>
        </View>
        <Text style={styles.title}>{shindig.title}</Text>
        <Text style={styles.meta}>
          {formatDate(shindig.createdAt)} • {shindig.photoCount} photos
        </Text>
        <Text numberOfLines={2} style={styles.vibe}>
          {stopSummary}
        </Text>
      </View>
    </ProgressiveImage>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderStrong,
    borderRadius: 26,
    borderWidth: 1,
    height: 260,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: {
      height: 10,
      width: 0,
    },
    shadowOpacity: 0.34,
    shadowRadius: 22,
    width: '100%',
  },
  image: {
    borderRadius: 26,
  },
  topGlow: {
    backgroundColor: 'rgba(255, 79, 160, 0.16)',
    borderRadius: theme.radius.round,
    height: 130,
    position: 'absolute',
    right: -20,
    top: -48,
    width: 130,
  },
  overlay: {
    backgroundColor: 'rgba(8, 11, 22, 0.58)',
    minHeight: '48%',
    padding: theme.spacing.md,
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.accentPink,
    borderRadius: theme.radius.round,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  pillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  meta: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: theme.spacing.xs,
  },
  vibe: {
    color: '#F4F7FF',
    fontSize: 13,
    lineHeight: 18,
    marginTop: theme.spacing.sm,
  },
});
