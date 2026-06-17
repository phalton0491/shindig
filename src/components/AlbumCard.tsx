import { ImageBackground, StyleSheet, Text, View } from 'react-native';

import { OutingAlbum } from '../data/mockProfile';
import { theme } from '../theme';

type AlbumCardProps = {
  album: OutingAlbum;
};

export function AlbumCard({ album }: AlbumCardProps) {
  return (
    <ImageBackground
      imageStyle={styles.image}
      source={{ uri: album.coverPhoto }}
      style={styles.card}
    >
      <View style={styles.overlay}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{album.moment}</Text>
        </View>
        <Text style={styles.title}>{album.title}</Text>
        <Text style={styles.meta}>
          {album.date} / {album.location}
        </Text>
        <Text numberOfLines={2} style={styles.vibe}>
          {album.vibe}
        </Text>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 240,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    width: '47%',
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
