import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image as NativeImage, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { AppIcon, Button, colors } from './ui';
import { shouldEnterRegister } from './intro-gesture';
import { bubbleLayout, openingBubbleLayout } from './intro-layout';
import { bubblePose, clamp, dragProgress, lensOffsetX, phaseOpacity, photoProgress } from './intro-motion';
import { IntroLens, introCopy } from './intro-lens';

const glass = require('../assets/intro-glass-bubble.png');
const portraits = [
  require('../assets/members/60072052427.png'),
  require('../assets/members/60059704482.jpg'),
  require('../assets/members/60059704310.png'),
  require('../assets/members/60062964687.png'),
  require('../assets/members/60062962003.jpg'),
  require('../assets/members/60064176111.png'),
  require('../assets/members/60062960489.png'),
  require('../assets/members/60066519892.png'),
  require('../assets/members/60065762010.png'),
  require('../assets/members/60065762120.jpg'),
  require('../assets/members/60064175576.jpg'),
  require('../assets/members/60065761363.png'),
  require('../assets/members/60065762038.png'),
  require('../assets/members/60059747359.png'),
  require('../assets/members/60065762007.png'),
  require('../assets/members/60065761543.jpg'),
  require('../assets/members/60064173292.jpg'),
  require('../assets/members/60059704736.png'),
  require('../assets/members/60062566016.png'),
  require('../assets/members/60059704832.png'),
];
const settle = { duration: 400, dampingRatio: .8 };
const easeOut = Easing.bezier(.23, 1, .32, 1);

function PhotoBubble({ index, width, height, reveal, clock, dragX, dragY, touchX, touchY, reduced }: {
  index: number; width: number; height: number; reveal: SharedValue<number>;
  clock: SharedValue<number>; dragX: SharedValue<number>; dragY: SharedValue<number>; touchX: SharedValue<number>; touchY: SharedValue<number>; reduced: boolean;
}) {
  const { left, top, diameter } = bubbleLayout(width, height, index);
  const animated = useAnimatedStyle(() => {
    const p = photoProgress(reveal.get(), index);
    const phase = clock.get() * Math.PI * 2 + index * 1.7;
    const distance = Math.hypot(touchX.get() - left - diameter / 2, touchY.get() - top - diameter / 2);
    const influence = clamp(1 - distance / 100);
    const arc = Math.sin(p * Math.PI) * (index % 2 ? 1 : -1) * (12 + index % 4 * 7);
    return {
      opacity: interpolate(p, [0, .15, 1], [0, 1, 1]),
      transform: [
        { translateX: reduced ? 0 : (width / 2 - left - diameter / 2) * (1 - p) + arc + dragX.get() * influence + Math.cos(phase) * 3 },
        { translateY: reduced ? 0 : (height * .46 - top - diameter / 2) * (1 - p) + Math.sin(phase) * (3 + index % 4) + dragY.get() * influence },
        { scale: reduced ? 1 : interpolate(p, [0, .7, 1], [.9, 1.08, 1]) },
      ],
    };
  });
  return <Animated.View pointerEvents="none" accessible={false} style={[styles.photoBubble, { left, top, width: diameter, height: diameter }, animated]}>
    <View style={styles.portraitClip}><NativeImage source={portraits[index]} resizeMode="cover" style={styles.fill} /></View>
    <NativeImage source={glass} resizeMode="contain" style={[styles.fill, styles.photoGlass]} />
  </Animated.View>;
}

export function IntroScreen({ faceIdEnabled, onContinueWithEmail, onContinueWithFaceId }: { faceIdEnabled: boolean; onContinueWithEmail: () => Promise<void>; onContinueWithFaceId: () => Promise<void> }) {
  const reduced = useReducedMotion();
  const [bounds, setBounds] = useState({ width: 390, height: 760 });
  const { width, height } = bounds;
  const [stage, setStage] = useState<'start' | 'revealing' | 'ready' | 'opening'>('start');
  const stageRef = useRef(stage);
  const [error, setError] = useState('');
  const reveal = useSharedValue(0), clock = useSharedValue(0), dragX = useSharedValue(0), dragY = useSharedValue(0);
  const lensX = useSharedValue(0), lensY = useSharedValue(0), touchX = useSharedValue(-1000), touchY = useSharedValue(-1000), lensDrag = useSharedValue(false);
  const ctaOpacity = useSharedValue(0);
  const busy = useSharedValue(false);
  const [footerHeight, setFooterHeight] = useState(96);
  const opening = openingBubbleLayout(width, height, footerHeight);
  const { diameter } = opening;
  const openingCenter = opening.top + diameter / 2;
  const [copyHeight, setCopyHeight] = useState(60);
  const [faceToast, setFaceToast] = useState(false);

  useEffect(() => {
    if (!reduced) clock.set(withRepeat(withTiming(1, { duration: 4800, easing: Easing.linear }), -1, false));
    return () => { [clock, reveal, dragX, dragY, lensX, lensY, ctaOpacity].forEach(cancelAnimation); };
  }, [clock, reveal, dragX, dragY, lensX, lensY, ctaOpacity, reduced]);

  const ready = useCallback(() => {
    stageRef.current = 'ready'; setStage('ready'); busy.set(false);
    ctaOpacity.set(withTiming(1, { duration: reduced ? 0 : 180, easing: easeOut }));
  }, [busy, ctaOpacity, reduced]);
  const finish = useCallback(async () => {
    try { await onContinueWithEmail(); ready(); }
    catch {
      ready(); setError('Could not open sign-in. Please try again.');
    }
  }, [onContinueWithEmail, ready]);
  const continueWithFaceId = useCallback(async () => {
    if (stageRef.current !== 'ready') return;
    setError(''); busy.set(true);
    try {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!hasHardware || !isEnrolled) {
        busy.set(false);
        setError('Face ID is not set up on this iPhone. Continue with work email.');
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Sign in to Device Management',
        cancelLabel: 'Use work email',
        disableDeviceFallback: true,
      });
      if (!result.success) { busy.set(false); return; }
      stageRef.current = 'opening'; setStage('opening'); setFaceToast(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 650));
      await onContinueWithFaceId();
    } catch {
      busy.set(false);
      setError('Face ID could not sign you in. Continue with work email.');
    }
  }, [busy, onContinueWithFaceId]);
  const advance = useCallback((velocityY = 0) => {
    if (stageRef.current === 'revealing' || stageRef.current === 'opening') return;
    setError(''); busy.set(true);
    dragX.set(withSpring(0, settle)); dragY.set(withSpring(0, settle));
    lensX.set(withSpring(0, settle)); lensY.set(withSpring(0, settle));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (stageRef.current === 'start') {
      stageRef.current = 'revealing'; setStage('revealing');
      if (reduced) {
        reveal.set(withTiming(1, { duration: 180 }, done => { if (done) scheduleOnRN(ready); }));
      } else {
        reveal.set(withSequence(
          withSpring(.68, { duration: 400, dampingRatio: 1, velocity: -velocityY / (height * .38), overshootClamping: true }),
          withTiming(1, { duration: 1150, easing: Easing.linear }, done => { if (done) scheduleOnRN(ready); }),
        ));
      }
    } else {
      stageRef.current = 'opening'; setStage('opening');
      void finish();
    }
  }, [busy, dragX, dragY, lensX, lensY, reveal, reduced, ready, finish, height]);
  const gesture = useMemo(() => Gesture.Pan().minDistance(8).enabled(stage !== 'revealing' && stage !== 'opening')
    .onStart(event => {
      [dragX, dragY, lensX, lensY, reveal].forEach(cancelAnimation);
      touchX.set(event.x); touchY.set(event.y);
      const pose = bubblePose(reveal.get(), height, diameter, openingCenter);
      lensDrag.set(stage === 'ready' && Math.hypot(event.x - width / 2, event.y - pose.centerY) < diameter * pose.scaleX / 2 + 24);
    })
    .onUpdate(event => {
      if (reduced) return;
      if (stage === 'start') {
        reveal.set(dragProgress(event.translationY, height));
        lensX.set(width * .10 * Math.tanh(event.translationX / (width * .10)));
      } else if (lensDrag.get()) {
        lensX.set(width * .24 * Math.tanh(event.translationX / (width * .24)));
        lensY.set(height * .25 * Math.tanh(event.translationY / (height * .25)));
      } else {
        dragX.set(42 * Math.tanh(event.translationX / 42));
        dragY.set(42 * Math.tanh(event.translationY / 42));
      }
    })
    .onEnd(event => {
      if (stage === 'start' && shouldEnterRegister(event.translationX, event.translationY, event.velocityY) && !busy.get()) {
        busy.set(true); scheduleOnRN(advance, event.velocityY);
      } else {
        dragX.set(withSpring(0, { ...settle, velocity: event.velocityX }));
        dragY.set(withSpring(0, { ...settle, velocity: event.velocityY }));
        lensX.set(withSpring(0, { ...settle, velocity: event.velocityX }));
        lensY.set(withSpring(0, { ...settle, velocity: event.velocityY }));
        if (stage === 'start') reveal.set(withSpring(0, { duration: 400, dampingRatio: 1 }));
      }
    })
    .onFinalize((_event, success) => {
      if (!success) {
        [dragX, dragY, lensX, lensY].forEach(v => v.set(withSpring(0, settle)));
        if (stage === 'start' && !busy.get()) reveal.set(withSpring(0, { duration: 400, dampingRatio: 1 }));
      }
    }), [stage, reduced, width, height, diameter, openingCenter, dragX, dragY, lensX, lensY, touchX, touchY, lensDrag, reveal, busy, advance]);

  const glassStyle = useAnimatedStyle(() => {
    const pose = bubblePose(reveal.get(), height, diameter, openingCenter);
    const bob = reduced ? 0 : Math.sin(clock.get() * Math.PI * 2) * (reveal.get() < .68 ? 9 : 3);
    return { opacity: interpolate(reveal.get(), [0, .72, .94, 1], [1, 1, .2, 0]), transform: [
      { translateX: reduced ? 0 : lensOffsetX(lensX.get(), width, diameter, pose.scaleX) },
      { translateY: pose.centerY - openingCenter + (reduced ? 0 : lensY.get() + bob) },
      { scaleX: pose.scaleX }, { scaleY: pose.scaleY },
    ] };
  });
  const reflectionStyle = useAnimatedStyle(() => ({ opacity: .14 + phaseOpacity(reveal.get(), .05, .3) * .22, transform: [{ rotate: `${reveal.get() * 32 + (reduced ? 0 : lensX.get() * .15)}deg` }, { scaleX: 1.025 }] }));
  const copyStyle = useAnimatedStyle(() => ({ opacity: phaseOpacity(reveal.get(), .26, .68), transform: [{ translateY: reduced ? 0 : (1 - phaseOpacity(reveal.get(), .26, .68)) * 12 }] }));
  const promptStyle = useAnimatedStyle(() => ({ opacity: 1 - phaseOpacity(reveal.get(), .02, .18) }));
  const ctaStyle = useAnimatedStyle(() => ({ opacity: reduced ? ctaOpacity.get() : phaseOpacity(reveal.get(), .74, .90), transform: [{ translateY: reduced ? 0 : (1 - phaseOpacity(reveal.get(), .74, .90)) * 12 }] }));
  const disabled = stage === 'revealing' || stage === 'opening';

  return <SafeAreaView style={styles.page}>
    <StatusBar style="dark" />
    <GestureDetector gesture={gesture}>
      <Animated.View collapsable={false} style={styles.content} onLayout={event => setBounds(event.nativeEvent.layout)}>
        <Animated.View pointerEvents="none" accessibilityElementsHidden={stage !== 'ready'} importantForAccessibility={stage === 'ready' ? 'auto' : 'no-hide-descendants'} style={[styles.copy, copyStyle]}>
          <Text maxFontSizeMultiplier={1.8} onLayout={event => setCopyHeight(event.nativeEvent.layout.height)} style={styles.purpose}>{introCopy}</Text>
        </Animated.View>
        <View pointerEvents="none" style={styles.scene} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Animated.View style={[styles.sphere, { width: diameter, height: diameter, left: opening.left, top: opening.top }, glassStyle]}>
            <View pointerEvents="none" style={styles.sphereBase} />
            <View pointerEvents="none" style={styles.sphereHighlight} />
            {!reduced && <IntroLens {...{ diameter, width, height, openingCenter, copyHeight, progress: reveal, dragX: lensX, dragY: lensY }} />}
            <NativeImage source={glass} resizeMode="contain" style={styles.fill} />
            {!reduced && <Animated.View style={[styles.scene, reflectionStyle]}><NativeImage source={glass} resizeMode="contain" style={styles.fill} /></Animated.View>}
          </Animated.View>
          {portraits.map((_portrait, index) => <PhotoBubble key={index} {...{ index, width, height, reveal, clock, dragX, dragY, touchX, touchY, reduced }} />)}
        </View>
        <View style={[styles.bottom, { minHeight: footerHeight }]}>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Animated.View pointerEvents={stage === 'start' ? 'auto' : 'none'} accessibilityElementsHidden={stage !== 'start'} importantForAccessibility={stage === 'start' ? 'auto' : 'no-hide-descendants'} style={[styles.promptLayer, promptStyle]}>
            <Pressable disabled={stage !== 'start'} accessibilityRole="button" accessibilityLabel="Get started" accessibilityHint="Reveal company member photos" onPress={() => advance()} style={styles.prompt}>
              <AppIcon name="chevron-up" size={22} color={colors.text} />
              <Text maxFontSizeMultiplier={1.8} style={styles.support}>Swipe up to get started</Text>
            </Pressable>
          </Animated.View>
          <Animated.View pointerEvents={stage === 'ready' ? 'auto' : 'none'} accessibilityElementsHidden={stage !== 'ready'} importantForAccessibility={stage === 'ready' ? 'auto' : 'no-hide-descendants'} style={[styles.cta, ctaStyle]}>
            <Button title="Continue with work email" primary icon="mail" disabled={disabled || stage !== 'ready'} onPress={() => advance()} />
            {faceIdEnabled && <Pressable accessibilityRole="button" accessibilityLabel="Continue with Face ID" disabled={disabled || stage !== 'ready'} onPress={() => void continueWithFaceId()} style={({ pressed }) => [styles.faceIdAction, { opacity: disabled || stage !== 'ready' ? .4 : pressed ? .55 : 1 }]}>
              <AppIcon name="face-id" size={22} color={colors.text} />
              <Text style={styles.faceIdText}>Continue with Face ID</Text>
            </Pressable>}
          </Animated.View>
        </View>
      </Animated.View>
    </GestureDetector>
    {faceToast ? <View pointerEvents="none" style={styles.toast}><AppIcon name="checkmark" size={18} color={colors.onAccent} /><Text style={styles.toastText}>Face ID recognised</Text></View> : null}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, overflow: 'hidden' },
  scene: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  fill: { width: '100%', height: '100%' },
  photoBubble: { position: 'absolute' },
  sphere: { position: 'absolute', borderRadius: 1000, overflow: 'hidden', backgroundColor: '#F5F8FF', borderWidth: 1.5, borderColor: '#B8E2FF', elevation: 5, shadowColor: '#9CCBFF', shadowOpacity: .28, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  sphereBase: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 1000, backgroundColor: 'rgba(238, 247, 255, .82)' },
  sphereHighlight: { position: 'absolute', top: '13%', left: '18%', width: '27%', height: '10%', borderRadius: 999, backgroundColor: 'rgba(255, 255, 255, .82)', transform: [{ rotate: '-28deg' }] },
  photoGlass: { opacity: .55 },
  portraitClip: { position: 'absolute', top: '7%', left: '7%', width: '86%', height: '86%', borderRadius: 100, overflow: 'hidden', opacity: .9 },
  copy: { position: 'absolute', top: '53%', bottom: '20%', left: 24, right: 24, justifyContent: 'center' },
  purpose: { fontFamily: 'GoogleSans_400Regular', fontSize: 21, lineHeight: 30, color: colors.text, textAlign: 'center' },
  bottom: { position: 'absolute', bottom: 12, left: 24, right: 24, minHeight: 80, alignItems: 'center', justifyContent: 'center' },
  promptLayer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  prompt: { minHeight: 72, paddingHorizontal: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', gap: 8 },
  cta: { width: '100%' },
  faceIdAction: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, marginTop: 8 },
  faceIdText: { fontFamily: 'GoogleSans_500Medium', fontSize: 16, lineHeight: 23, color: colors.text },
  toast: { position: 'absolute', top: 58, left: 24, right: 24, minHeight: 48, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.text, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  toastText: { fontFamily: 'GoogleSans_500Medium', fontSize: 15, lineHeight: 21, color: colors.onAccent },
  support: { fontFamily: 'GoogleSans_400Regular', fontSize: 15, lineHeight: 23, color: colors.text, textAlign: 'center' },
  error: { fontFamily: 'GoogleSans_400Regular', fontSize: 14, lineHeight: 20, textAlign: 'center', color: colors.orange },
});
