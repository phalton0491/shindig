import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  ImageResizeMode,
  ImageStyle,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { theme } from '../theme';

type ProgressiveImageProps = {
  children?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  sourceUri: string;
};

export function ProgressiveImage({
  children,
  containerStyle,
  imageStyle,
  resizeMode = 'cover',
  sourceUri,
}: ProgressiveImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    setIsLoaded(false);
  }, [sourceUri]);

  useEffect(() => {
    if (isLoaded) {
      pulse.stopAnimation();
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          duration: 900,
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          duration: 900,
          toValue: 0.45,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [isLoaded, pulse]);

  return (
    <View style={containerStyle}>
      {!isLoaded ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.placeholder, { opacity: pulse }]}
        >
          <View style={styles.placeholderGlow} />
          <View style={styles.placeholderLines}>
            <View style={[styles.placeholderLine, styles.placeholderLineWide]} />
            <View style={[styles.placeholderLine, styles.placeholderLineMid]} />
            <View style={[styles.placeholderLine, styles.placeholderLineShort]} />
          </View>
        </Animated.View>
      ) : null}

      <Image
        onError={() => setIsLoaded(true)}
        onLoadEnd={() => setIsLoaded(true)}
        resizeMode={resizeMode}
        source={{ uri: sourceUri }}
        style={[styles.image, imageStyle, !isLoaded && styles.imageHidden]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    ...StyleSheet.absoluteFillObject,
  },
  imageHidden: {
    opacity: 0,
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.surfaceRaised,
    overflow: 'hidden',
  },
  placeholderGlow: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    height: '100%',
    position: 'absolute',
    right: -40,
    top: 0,
    transform: [{ skewX: '-12deg' }],
    width: 110,
  },
  placeholderLines: {
    bottom: 18,
    gap: 8,
    left: 16,
    position: 'absolute',
    right: 16,
  },
  placeholderLine: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: theme.radius.round,
    height: 10,
  },
  placeholderLineWide: {
    width: '68%',
  },
  placeholderLineMid: {
    width: '52%',
  },
  placeholderLineShort: {
    width: '34%',
  },
});
