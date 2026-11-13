import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { bubblePose, lensOffsetX, phaseOpacity } from './intro-motion';
import { colors } from './ui';

export const introCopy = 'Track company phones and\nthe people using them.';
const bands = 9;

function LensBand({ index, diameter, width, height, openingCenter, copyHeight, progress, dragX, dragY }: {
  index: number; diameter: number; width: number; height: number; openingCenter: number; copyHeight: number;
  progress: SharedValue<number>; dragX: SharedValue<number>; dragY: SharedValue<number>;
}) {
  const bandWidth = diameter / bands;
  const offset = index * bandWidth;
  const textWidth = width - 48;
  const animated = useAnimatedStyle(() => {
    const pose = bubblePose(progress.get(), height, diameter, openingCenter);
    const edge = Math.abs((index + .5) / bands * 2 - 1);
    const magnification = 1.34 - edge * edge * .45;
    return {
      opacity: phaseOpacity(progress.get(), .26, .40),
      transform: [
        { translateX: -lensOffsetX(dragX.get(), width, diameter, pose.scaleX) / pose.scaleX },
        { translateY: (height * .665 - pose.centerY - dragY.get()) / pose.scaleY },
        { scaleX: magnification / pose.scaleX },
        { scaleY: (1.22 - edge * .12) / pose.scaleY },
      ],
    };
  });
  // Clipped bands magnify the actual copy differently across the curved lens.
  return <View style={{ position: 'absolute', left: offset, width: bandWidth + .5, height: diameter, overflow: 'hidden' }}>
    <Animated.View style={[{ position: 'absolute', left: diameter / 2 - textWidth / 2 - offset, top: (diameter - copyHeight) / 2, width: textWidth, height: copyHeight }, animated]}>
      <Text maxFontSizeMultiplier={1.8} style={styles.text}>{introCopy}</Text>
    </Animated.View>
  </View>;
}

export function IntroLens(props: Omit<React.ComponentProps<typeof LensBand>, 'index'>) {
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.clip, { width: props.diameter, height: props.diameter }]}>
    <View style={styles.membrane} />
    {Array.from({ length: bands }, (_, index) => <LensBand key={index} index={index} {...props} />)}
  </View>;
}
const styles = StyleSheet.create({
  clip: { position: 'absolute', borderRadius: 1000, overflow: 'hidden' },
  membrane: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFFE8' },
  text: { fontFamily: 'GoogleSans_400Regular', fontSize: 21, lineHeight: 30, color: colors.text, textAlign: 'center' },
});
