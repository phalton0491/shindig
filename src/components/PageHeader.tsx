import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

type PageHeaderProps = {
  onBack?: () => void;
  right?: React.ReactNode;
  title?: string;
};

export function PageHeader({ onBack, right, title }: PageHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.side}>
        {onBack ? (
          <Pressable onPress={onBack} style={styles.backButton}>
            <Ionicons color={theme.colors.textPrimary} name="chevron-back" size={28} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.center}>
        {title ? (
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
        ) : null}
      </View>

      <View style={[styles.side, styles.sideRight]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 56,
  },
  side: {
    justifyContent: 'center',
    minWidth: 112,
  },
  sideRight: {
    alignItems: 'flex-end',
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: theme.spacing.sm,
  },
  backButton: {
    alignItems: 'flex-start',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
});
