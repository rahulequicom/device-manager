import React, { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolView } from 'expo-symbols';
import Animated, { cubicBezier, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const lightColors = { bg: '#FFFFFF', surface: '#F6F6F7', elevated: '#EDEDEF', border: '#D9D9DE', text: '#111111', muted: '#626268', accent: '#000000', pink: '#9A257B', orange: '#B64221', onAccent: '#FFFFFF' };
const darkColors = { bg: '#111111', surface: '#1C1C1E', elevated: '#2C2C2E', border: '#3A3A3C', text: '#F5F5F7', muted: '#A1A1A6', accent: '#FFFFFF', pink: '#D982C5', orange: '#F08A67', onAccent: '#111111' };
export let colors = lightColors;
const symbols = {
  'info-circle': { sf: 'info.circle', md: 'info-outline' },
  'phone-portrait-outline': { sf: 'iphone', md: 'phone-iphone' },
  'scan-outline': { sf: 'barcode.viewfinder', md: 'qr-code-scanner' },
  add: { sf: 'plus', md: 'add' },
  'phone-add': { sf: 'phone.badge.plus', md: 'add' },
  'list-outline': { sf: 'list.bullet', md: 'list' },
  'search-outline': { sf: 'magnifyingglass', md: 'search' },
  'close-circle': { sf: 'xmark.circle.fill', md: 'cancel' },
  'chevron-forward': { sf: 'chevron.right', md: 'chevron-right' },
  'chevron-down': { sf: 'chevron.down', md: 'expand-more' },
  'chevron-up': { sf: 'chevron.up', md: 'expand-less' },
  'person-outline': { sf: 'person', md: 'person-outline' },
  mail: { sf: 'envelope', md: 'mail-outline' },
  'create-outline': { sf: 'square.and.pencil', md: 'edit' },
  'settings-outline': { sf: 'gearshape', md: 'settings' },
  'share-outline': { sf: 'square.and.arrow.up', md: 'ios-share' },
  checkmark: { sf: 'checkmark', md: 'check' },
  'face-id': { sf: 'faceid', md: 'face' },
  flash: { sf: 'bolt.fill', md: 'flash-on' },
  'flash-outline': { sf: 'bolt', md: 'flash-off' },
} as const;
type Icon = keyof typeof symbols;
export function AppIcon({ name, size = 24, color }: { name: Icon; size?: number; color: string }) {
  return Platform.OS === 'ios' ? <SymbolView name={symbols[name].sf} tintColor={color} weight="regular" style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no" /> : <MaterialIcons name={symbols[name].md} size={size} color={color} accessible={false} />;
}
export function NativeSegments({ values, index, onChange }: { values: string[]; index: number; onChange: (index: number) => void }) {
  return <View style={s.segments}>{values.map((value, valueIndex) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: valueIndex === index }} onPress={() => { void Haptics.selectionAsync().catch(() => {}); onChange(valueIndex); }} style={({ pressed }) => [s.segment, valueIndex === index && s.selectedSegment, pressed && s.pressedSegment]}><Text style={s.segmentText}>{value}</Text></Pressable>)}</View>;
}
export function NativePicker({ values, selected, onChange }: { values: string[]; selected: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const label = selected === 'All' ? 'All teams' : `${selected} team`;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Filter by team" accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} style={({ pressed }) => [s.picker, pressed && s.pressedRow]}><Text style={s.pickerText}>{label}</Text><AppIcon name="chevron-down" size={18} color={colors.muted} /></Pressable>
    <Modal transparent animationType="fade" visible={open} onRequestClose={() => setOpen(false)}>
      <Pressable style={s.pickerBackdrop} onPress={() => setOpen(false)}>
        <Pressable style={s.pickerMenu} onPress={() => {}}>
          <Text style={s.pickerMenuTitle}>Filter by team</Text>
          {values.map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: value === selected }} onPress={() => { setOpen(false); onChange(value); }} style={({ pressed }) => [s.pickerOption, value === selected && s.selectedPickerOption, pressed && s.pressedRow]}><Text style={s.pickerOptionText}>{value === 'All' ? 'All teams' : `${value} team`}</Text>{value === selected && <AppIcon name="checkmark" size={20} color={colors.accent} />}</Pressable>)}
        </Pressable>
      </Pressable>
    </Modal>
  </>;
}
export function Button({ title, onPress, disabled = false, primary = false, icon }: { title: string; onPress: () => void; disabled?: boolean; primary?: boolean; icon?: Icon }) {
  const [pressed, setPressed] = useState(false), reduced = useReducedMotion();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} pressRetentionOffset={16}><Animated.View style={[s.button, primary && s.primary, { transform: [{ scale: pressed && !reduced ? .97 : 1 }], opacity: disabled ? .4 : pressed ? .85 : 1, transitionProperty: ['transform', 'opacity'], transitionDuration: reduced ? 0 : 120, transitionTimingFunction: cubicBezier(.23, 1, .32, 1) }]}>{icon && <AppIcon name={icon} size={21} color={primary ? colors.onAccent : colors.accent} />}<Text style={[s.buttonText, { color: primary ? colors.onAccent : colors.accent }]}>{title}</Text></Animated.View></Pressable>;
}
export function IconButton({ name, label, onPress }: { name: Icon; label: string; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [s.iconButton, { opacity: pressed ? .5 : 1 }]}><View style={name === 'person-outline' ? s.profileIconCircle : undefined}><AppIcon name={name} size={name === 'person-outline' ? 19 : 22} color={colors.accent} /></View></Pressable>; }
export function Page({ children }: { children: React.ReactNode }) { return <SafeAreaView edges={['bottom', 'left', 'right']} style={s.page}>{children}</SafeAreaView>; }
export function DevicesHeader({ onIntro, onProfile }: { onIntro: () => void; onProfile: () => void }) {
  return <SafeAreaView edges={['top']} style={s.deviceHeaderSafe}>
    <View style={s.deviceHeaderActions}>
      <IconButton name="info-circle" label="Replay introduction" onPress={onIntro} />
      <IconButton name="person-outline" label="Profile and settings" onPress={onProfile} />
    </View>
    <Text style={s.largeTitle}>Devices</Text>
  </SafeAreaView>;
}
export function Section({ title }: { title: string }) { return <Text style={s.section}>{title}</Text>; }
export function DeviceRow({ id, name, subtitle, trailing, onPress, disabled = false }: { id: string; name: string; subtitle: string; trailing?: string; onPress: (id: string) => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${name}, ${subtitle}`} disabled={disabled} onPress={() => onPress(id)} style={({ pressed }) => [s.deviceRow, pressed && s.pressedRow]}><View style={s.phoneIcon}><AppIcon name="phone-portrait-outline" size={26} color={colors.text} /></View><View style={s.flex}><Text style={s.rowTitle}>{name}</Text><Text style={s.small}>{subtitle}</Text>{trailing ? <Text style={[s.small, { marginTop: 4 }]}>{trailing}</Text> : null}</View><AppIcon name="chevron-forward" size={18} color={colors.muted} /></Pressable>;
}
function createStyles() { return StyleSheet.create({
  pressedRow: { backgroundColor: colors.elevated }, pressedSegment: { opacity: .68 }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginBottom: 8 }, settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, settingControl: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, profileHeader: { alignItems: 'center', paddingVertical: 20 }, profileAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }, profileIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.elevated, alignItems: 'center', justifyContent: 'center' }, deviceHeaderSafe: { backgroundColor: colors.bg, paddingHorizontal: 20 }, deviceHeaderActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 50 }, largeTitle: { fontFamily: 'GoogleSans_700Bold', fontSize: 34, lineHeight: 42, color: colors.text, paddingBottom: 10 }, dangerText: { fontFamily: 'GoogleSans_400Regular', fontSize: 17, lineHeight: 25, color: colors.orange }, picker: { minHeight: 44, maxWidth: 180, paddingHorizontal: 12, borderRadius: 8, borderCurve: "continuous", backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 6 }, pickerText: { fontFamily: 'GoogleSans_500Medium', fontSize: 15, color: colors.text }, pickerBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,.32)' }, pickerMenu: { backgroundColor: colors.bg, borderRadius: 12, borderCurve: "continuous", padding: 8, shadowColor: '#000000', shadowOpacity: .18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 }, pickerMenuTitle: { fontFamily: 'GoogleSans_600SemiBold', fontSize: 18, lineHeight: 24, color: colors.text, paddingHorizontal: 12, paddingVertical: 12 }, pickerOption: { minHeight: 48, paddingHorizontal: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, selectedPickerOption: { backgroundColor: colors.elevated }, pickerOptionText: { fontFamily: 'GoogleSans_400Regular', fontSize: 16, color: colors.text },
  page: { flex: 1, backgroundColor: colors.bg }, flex: { flex: 1 }, content: { padding: 20, paddingBottom: 32 }, center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }, title: { fontFamily: 'GoogleSans_700Bold', fontSize: 28, lineHeight: 36, color: colors.text }, body: { fontFamily: 'GoogleSans_400Regular', fontSize: 17, lineHeight: 25, color: colors.text }, subtitle: { fontFamily: 'GoogleSans_400Regular', fontSize: 16, lineHeight: 24, color: colors.muted, marginTop: 8, marginBottom: 20 }, small: { fontFamily: 'GoogleSans_400Regular', fontSize: 14, lineHeight: 21, color: colors.muted }, section: { fontFamily: 'GoogleSans_500Medium', fontSize: 13, lineHeight: 20, color: colors.muted, marginTop: 28, marginBottom: 10, paddingHorizontal: 4 }, rowTitle: { fontFamily: 'GoogleSans_500Medium', fontSize: 17, lineHeight: 25, color: colors.text },
  button: { minHeight: 52, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 8, borderCurve: "continuous", backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, primary: { backgroundColor: colors.accent }, buttonText: { fontFamily: 'GoogleSans_600SemiBold', fontSize: 17, lineHeight: 24, flexShrink: 1 }, iconButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }, toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, paddingHorizontal: 20, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, bottom: { padding: 16, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.bg, flexShrink: 0 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 8, borderCurve: "continuous", backgroundColor: colors.surface, marginBottom: 16 }, searchInput: { flex: 1, minHeight: 48, fontFamily: 'GoogleSans_400Regular', fontSize: 17, color: colors.text }, segments: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: 8, borderCurve: "continuous", backgroundColor: colors.surface }, segment: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 8, borderRadius: 6 }, selectedSegment: { backgroundColor: colors.elevated }, segmentText: { fontFamily: 'GoogleSans_500Medium', fontSize: 14, color: colors.text }, filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 12, gap: 12, flexWrap: 'wrap' }, filterButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }, accentText: { color: colors.accent, fontFamily: 'GoogleSans_500Medium', fontSize: 15 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: colors.surface, borderRadius: 8, borderCurve: "continuous", marginBottom: 8, minHeight: 92 }, phoneIcon: { width: 42, height: 52, borderRadius: 8, borderCurve: "continuous", alignItems: 'center', justifyContent: 'center', backgroundColor: colors.elevated }, group: { backgroundColor: colors.surface, borderRadius: 8, borderCurve: "continuous", overflow: 'hidden' }, spec: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 5 }, specValue: { fontFamily: 'GoogleSans_400Regular', fontSize: 17, lineHeight: 25, color: colors.text }, holder: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }, holderIcon: { width: 40, height: 40, borderRadius: 20, borderCurve: "continuous", backgroundColor: colors.elevated, alignItems: 'center', justifyContent: 'center' }, actionRow: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, field: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 6 }, label: { fontFamily: 'GoogleSans_500Medium', color: colors.muted, fontSize: 13 }, input: { minHeight: 44, fontFamily: 'GoogleSans_400Regular', fontSize: 17, lineHeight: 24, color: colors.text, paddingVertical: 8 }, person: { minHeight: 60, flexDirection: 'row', gap: 12, alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, error: { fontFamily: 'GoogleSans_400Regular', fontSize: 15, lineHeight: 23, color: colors.orange, marginBottom: 16 }, camera: { height: 300, backgroundColor: colors.surface, borderRadius: 8, borderCurve: "continuous", overflow: 'hidden', marginBottom: 16 }, event: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 6 }, empty: { paddingVertical: 40, alignItems: 'center', gap: 12 },
}); }
export let s = createStyles();
export function setTheme(mode: 'Light' | 'Dark' | 'System') { colors = mode === 'Dark' ? darkColors : lightColors; s = createStyles(); }
