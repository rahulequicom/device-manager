import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Appearance, FlatList, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Share, Switch, Text, TextInput, View } from 'react-native';
import { DefaultTheme, NavigationContainer, useIsFocused, usePreventRemove } from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { GoogleSans_400Regular } from '@expo-google-fonts/google-sans/400Regular';
import { GoogleSans_500Medium } from '@expo-google-fonts/google-sans/500Medium';
import { GoogleSans_600SemiBold } from '@expo-google-fonts/google-sans/600SemiBold';
import { GoogleSans_700Bold } from '@expo-google-fonts/google-sans/700Bold';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useReducedMotion } from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { IntroScreen } from './src/intro-screen';
import { WorkEmailScreen } from './src/work-email-screen';
import { checkRegisteredIdentity, fetchInventorySnapshot, syncDeviceSnapshot } from './src/cloud-sync';

import { Device, DeviceIdentifiers, Holder, Team, fieldNames, filterDevices, findDevice, findRegisteredDevice, handover, initialDevices, members, mergeRemoteDevices, validateDevice, isProductBarcode, linkBarcode, lookupScannedProfile, mergeScannedDevice, parseScannedDevice } from './src/model';
import { deviceDetailState, deviceRegisterState } from './src/navigation';
import { AppIcon, Button, DeviceRow, DevicesHeader, IconButton, NativePicker, NativeSegments, Page, Section, colors, s, setTheme } from './src/ui';

type Routes = { Intro: { replay?: boolean } | undefined; WorkEmail: undefined; Devices: undefined; Profile: undefined; Settings: undefined; Details: { id: string }; Assign: { id: string }; Form: { id?: string; barcode?: string; values?: string[]; identifiers?: DeviceIdentifiers }; Scan: { registration?: boolean } | undefined; MatchScan: { code: string; type: string } };
type Props<K extends keyof Routes> = NativeStackScreenProps<Routes, K>;
const Stack = createNativeStackNavigator<Routes>();
const storageKey = 'mobile-device-register-v1';
const introKey = 'device-introduction-v1';
type RegistrationMode = 'Scan' | 'Manual';
type AppearanceMode = 'Light' | 'Dark' | 'System';
type CloudSyncState = { status: 'idle' | 'syncing' | 'synced' | 'error'; message: string };
const Store = createContext<{ devices: Device[]; commit: (next: Device[]) => Promise<void>; busy: boolean; registrationMode: RegistrationMode; setRegistrationMode: (mode: RegistrationMode) => Promise<void>; appearanceMode: AppearanceMode; setAppearanceMode: (mode: AppearanceMode) => Promise<void>; faceIdEnabled: boolean; setFaceIdEnabled: (enabled: boolean) => Promise<void>; refreshFromCloud: () => Promise<void>; cloudSync: CloudSyncState }>({ devices: [], commit: async () => {}, busy: false, registrationMode: 'Scan', setRegistrationMode: async () => {}, appearanceMode: 'Light', setAppearanceMode: async () => {}, faceIdEnabled: true, setFaceIdEnabled: async () => {}, refreshFromCloud: async () => {}, cloudSync: { status: 'idle', message: '' } });
function showError(error: unknown) { Alert.alert('Could not save', error instanceof Error ? error.message : 'Please try again.'); }
function clearIntroSeen() { return AsyncStorage.removeItem(introKey); }

export default function App() {
  // Do not hold the first screen behind font downloads; React Native uses its system fallback until these finish.
  useFonts({ GoogleSans_400Regular, GoogleSans_500Medium, GoogleSans_600SemiBold, GoogleSans_700Bold });
  const reducedMotion = useReducedMotion();
  const [devices, setDevices] = useState<Device[]>(initialDevices), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [loadError, setLoadError] = useState(false), [registrationMode, setRegistrationModeState] = useState<RegistrationMode>('Scan'), [appearanceMode, setAppearanceModeState] = useState<AppearanceMode>('Light'), [faceIdEnabled, setFaceIdEnabledState] = useState(true), [cloudSync, setCloudSync] = useState<CloudSyncState>({ status: 'idle', message: '' });
  const saving = useRef(false);
  const [introSeen, setIntroSeen] = useState(false);
  const refreshFromCloud = useCallback(async () => {
    setCloudSync({ status: 'syncing', message: 'Refreshing from web...' });
    try {
      const snapshot = await fetchInventorySnapshot();
      setDevices(previous => {
        const merged = mergeRemoteDevices(previous, snapshot.devices);
        void AsyncStorage.setItem(storageKey, JSON.stringify(merged));
        return merged;
      });
      setCloudSync({ status: 'synced', message: 'Synced with web' });
    } catch (error) {
      setCloudSync({ status: 'error', message: error instanceof Error ? error.message : 'Web inventory refresh failed' });
    }
  }, []);
  async function load() {
    setLoadError(false);
    try {
      const stored = await AsyncStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed) || !parsed.every(d => d && typeof d.id === 'string' && typeof d.barcode === 'string' && Array.isArray(d.values) && d.values.length === 8 && d.values.every((v: unknown) => typeof v === 'string') && Array.isArray(d.history) && d.history.every((e: any) => e && typeof e.text === 'string' && typeof e.at === 'string' && typeof e.actor === 'string') && (d.holder === null || (d.holder && Object.keys(members).includes(d.holder.team) && typeof d.holder.person === 'string')) && (d.barcodeAliases === undefined || (Array.isArray(d.barcodeAliases) && d.barcodeAliases.every((v: unknown) => typeof v === 'string'))) && (d.identifiers === undefined || (d.identifiers && typeof d.identifiers === 'object' && Object.values(d.identifiers).every((v: unknown) => typeof v === 'string'))))) throw new Error('Invalid saved register');
        setDevices(parsed);
      }
      setIntroSeen(await AsyncStorage.getItem(introKey) === 'seen');
      const savedMode = await AsyncStorage.getItem('device-registration-mode');
      if (savedMode === 'Scan' || savedMode === 'Manual') setRegistrationModeState(savedMode);
      const savedAppearance = await AsyncStorage.getItem('device-appearance');
      if (savedAppearance === 'Light' || savedAppearance === 'Dark' || savedAppearance === 'System') { setTheme(savedAppearance); setAppearanceModeState(savedAppearance); }
      const savedFaceId = await AsyncStorage.getItem('device-face-id');
      if (savedFaceId !== null) setFaceIdEnabledState(savedFaceId !== 'off');
      setReady(true);
      void refreshFromCloud();
    } catch { setLoadError(true); }
  }
  useEffect(() => { void load(); return () => Appearance.setColorScheme('unspecified'); }, []);
  useEffect(() => { if (appearanceMode === 'Light') Appearance.setColorScheme('light'); else if (appearanceMode === 'Dark') Appearance.setColorScheme('dark'); else Appearance.setColorScheme('unspecified'); }, [appearanceMode]);
  const commit = useCallback(async (next: Device[]) => {
    if (saving.current) throw new Error('A save is in progress. Try again in a moment.');
    saving.current = true; setBusy(true);
    try {
      const changed = next.filter(device => {
        const previous = devices.find(value => value.id === device.id);
        return !previous || JSON.stringify(previous) !== JSON.stringify(device);
      });
      await AsyncStorage.setItem(storageKey, JSON.stringify(next));
      setDevices(next);
      if (changed.length) {
        setCloudSync({ status: 'syncing', message: 'Syncing with web...' });
        const results = await Promise.allSettled(changed.map(syncDeviceSnapshot));
        const failed = results.find(result => result.status === 'rejected');
        if (failed?.status === 'rejected') setCloudSync({ status: 'error', message: `Saved on this phone, but web sync failed: ${failed.reason instanceof Error ? failed.reason.message : 'try again later.'}` });
        else setCloudSync({ status: 'synced', message: 'Synced with web' });
      }
    }
    finally { saving.current = false; setBusy(false); }
  }, [devices]);
  const setRegistrationMode = useCallback(async (mode: RegistrationMode) => {
    await AsyncStorage.setItem('device-registration-mode', mode);
    setRegistrationModeState(mode);
  }, []);
  const setAppearanceMode = useCallback(async (mode: AppearanceMode) => {
    await AsyncStorage.setItem('device-appearance', mode);
    setTheme(mode);
    setAppearanceModeState(mode);
  }, []);
  const setFaceIdEnabled = useCallback(async (enabled: boolean) => {
    await AsyncStorage.setItem('device-face-id', enabled ? 'on' : 'off');
    setFaceIdEnabledState(enabled);
  }, []);
  const storeValue = useMemo(() => ({ devices, commit, busy, registrationMode, setRegistrationMode, appearanceMode, setAppearanceMode, faceIdEnabled, setFaceIdEnabled, refreshFromCloud, cloudSync }), [devices, commit, busy, registrationMode, setRegistrationMode, appearanceMode, setAppearanceMode, faceIdEnabled, setFaceIdEnabled, refreshFromCloud, cloudSync]);
  if (!ready) return <SafeAreaProvider><StatusBar style={appearanceMode === 'Dark' ? 'light' : 'dark'} /><SafeAreaView style={[s.page, s.center]}>{loadError ? <><Text style={s.title}>Register could not load</Text><Text style={s.subtitle}>Your saved records have not been changed.</Text><Button title="Try again" onPress={() => void load()} /></> : <ActivityIndicator size="large" color={colors.accent} />}</SafeAreaView></SafeAreaProvider>;
  return <GestureHandlerRootView style={s.flex}><SafeAreaProvider><StatusBar style={appearanceMode === 'Dark' ? 'light' : 'dark'} /><Store.Provider value={storeValue}><NavigationContainer theme={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.bg, text: colors.text, primary: colors.accent, border: colors.border } }} linking={{ prefixes: ['device-register://'], config: { initialRouteName: 'Devices', screens: { Devices: 'devices', Details: 'device/:id' } } }}><Stack.Navigator initialRouteName={introSeen ? 'Devices' : 'Intro'} screenOptions={({ navigation, route }) => ({ animation: reducedMotion ? 'fade' : 'default', headerShadowVisible: false, headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.accent, headerTitleStyle: { fontFamily: 'GoogleSans_600SemiBold', color: colors.text }, headerBackButtonDisplayMode: 'minimal', gestureEnabled: true, contentStyle: { backgroundColor: colors.bg }, headerRight: route.name === 'WorkEmail' || route.name === 'Profile' ? undefined : route.name === 'Devices' ? () => <IconButton name="person-outline" label="Profile and settings" onPress={() => navigation.navigate('Profile')} /> : () => <IconButton name="list-outline" label="All devices" onPress={() => navigation.popTo('Devices')} /> })}>
    <Stack.Screen name="Intro" component={Introduction} options={{ headerShown: false, animation: 'fade' }} />
    <Stack.Screen name="WorkEmail" children={({ navigation }) => <WorkEmailScreen onAuthenticated={() => navigation.replace('Devices')} />} options={{ title: 'Work email', headerRight: undefined }} />
    <Stack.Screen name="Devices" component={Devices} options={{ headerShown: false }} />
    <Stack.Screen name="Profile" component={Profile} options={{ title: 'Profile' }} />
    <Stack.Screen name="Details" component={Details} options={{ title: 'Device' }} />
    <Stack.Screen name="Assign" component={Assign} options={({ navigation }) => ({ title: 'Assign phone', presentation: 'modal', headerLeft: () => <Pressable accessibilityRole="button" onPress={() => navigation.goBack()} style={s.iconButton}><Text style={s.accentText}>Cancel</Text></Pressable> })} />
    <Stack.Screen name="Form" component={Form} options={({ navigation, route }) => ({ title: route.params.id ? 'Edit phone' : 'Register phone', presentation: 'modal', headerLeft: () => <Pressable accessibilityRole="button" onPress={() => navigation.goBack()} style={s.iconButton}><Text style={s.accentText}>Cancel</Text></Pressable> })} />
    <Stack.Screen name="Scan" component={Scan} options={{ title: 'Scan label' }} />
    <Stack.Screen name="MatchScan" component={MatchScan} options={{ title: 'Scanned label' }} />
  </Stack.Navigator></NavigationContainer></Store.Provider></SafeAreaProvider></GestureHandlerRootView>;
}

function Introduction({ navigation }: Props<'Intro'>) {
  const { faceIdEnabled } = useContext(Store);
  const continueWithEmail = useCallback(async () => {
    navigation.navigate('WorkEmail');
  }, [navigation]);
  const continueWithFaceId = useCallback(async () => {
    navigation.replace('Devices');
  }, [navigation]);
  return <IntroScreen faceIdEnabled={faceIdEnabled} onContinueWithEmail={continueWithEmail} onContinueWithFaceId={continueWithFaceId} />;
}

function Profile({ navigation }: Props<'Profile'>) {
  const { commit, registrationMode, setRegistrationMode, appearanceMode, setAppearanceMode, faceIdEnabled, setFaceIdEnabled } = useContext(Store);
  function logout() { Alert.alert('Log out?', 'You can sign in again with your work email.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: () => navigation.replace('WorkEmail') }]); }
  function deleteAccount() { Alert.alert('Delete account?', 'This will remove the locally saved device register from this iPhone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await commit([]); await clearIntroSeen(); navigation.replace('Intro'); } }]); }
  return <Page><ScrollView style={s.flex} contentContainerStyle={s.content}><View style={s.profileHeader}><View style={s.profileAvatar}><AppIcon name="person-outline" size={30} color={colors.text} /></View><Text style={s.title}>Bhumika</Text><Text style={s.subtitle}>bhumika@equicomtech.com</Text></View><Section title="ACCOUNT" /><View style={s.group}><View style={s.spec}><Text style={s.small}>Work account</Text><Text style={s.specValue}>Equicomtech</Text></View></View><Section title="SETTINGS" /><View style={s.group}><View style={s.spec}><Text style={s.specValue}>Appearance</Text><NativeSegments values={['Light', 'Dark', 'System']} index={['Light', 'Dark', 'System'].indexOf(appearanceMode)} onChange={index => void setAppearanceMode((['Light', 'Dark', 'System'] as const)[index])} /></View><View style={[s.spec, s.settingControl]}><Text style={s.specValue}>Face ID sign-in</Text><Switch value={faceIdEnabled} onValueChange={value => void setFaceIdEnabled(value)} trackColor={{ false: colors.border, true: colors.accent }} thumbColor={colors.onAccent} /></View><View style={s.spec}><Text style={s.specValue}>Add device with</Text><NativeSegments values={['Scan', 'Manual']} index={registrationMode === 'Scan' ? 0 : 1} onChange={index => void setRegistrationMode(index === 0 ? 'Scan' : 'Manual')} /></View></View><Section title="ACTIONS" /><View style={s.group}><Pressable accessibilityRole="button" onPress={logout} style={s.spec}><Text style={s.specValue}>Log out</Text></Pressable><Pressable accessibilityRole="button" onPress={deleteAccount} style={s.spec}><Text style={s.dangerText}>Delete account</Text></Pressable></View></ScrollView></Page>;
}

function Devices({ navigation }: Props<'Devices'>) {
  const { devices, registrationMode, appearanceMode, cloudSync, refreshFromCloud } = useContext(Store);
  const focused = useIsFocused();
  const [query, setQuery] = useState(''), [team, setTeam] = useState<Team | 'All'>('All'), [status, setStatus] = useState<'All' | 'Assigned' | 'Available'>('All');
  useEffect(() => {
    if (!focused) return;
    void refreshFromCloud();
    const timer = setInterval(() => void refreshFromCloud(), 30000);
    return () => clearInterval(timer);
  }, [focused, refreshFromCloud]);
  const filtered = useMemo(() => filterDevices(devices, query, team, status), [devices, query, team, status]);
  const openDevice = useCallback((id: string) => navigation.navigate('Details', { id }), [navigation]);
  const hasFilter = !!query || team !== 'All' || status !== 'All';
  function clear() { setQuery(''); setTeam('All'); setStatus('All'); }
  function startRegistration() { if (registrationMode === 'Scan') navigation.navigate('Scan', { registration: true }); else navigation.navigate('Form', {}); }
  return <Page>
    <DevicesHeader onIntro={() => navigation.navigate('Intro', { replay: true })} onProfile={() => navigation.navigate('Profile')} />
    {cloudSync.status !== 'idle' && <Text style={[s.small, cloudSync.status === 'error' && s.error]}>{cloudSync.message}</Text>}
    <FlatList style={s.flex} data={filtered} extraData={appearanceMode} keyExtractor={d => d.id} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}
      ListHeaderComponent={<>
        <View style={s.search}><AppIcon name="search-outline" size={21} color={colors.muted} /><TextInput accessibilityLabel="Search devices" placeholder="Search phones or people" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} style={s.searchInput} autoCorrect={false} />{!!query && <IconButton name="close-circle" label="Clear search" onPress={() => setQuery('')} />}</View>
        <NativeSegments values={['All', 'Assigned', 'Available']} index={['All', 'Assigned', 'Available'].indexOf(status)} onChange={index => setStatus((['All', 'Assigned', 'Available'] as const)[index])} />
        <View style={s.filterRow}><NativePicker values={['All', 'Mobile', 'QA', 'Design']} selected={team} onChange={value => setTeam(value as Team | 'All')} /><Text style={s.small}>{hasFilter ? `${filtered.length} of ${devices.length}` : `${devices.length}`} {devices.length === 1 ? 'phone' : 'phones'}</Text>{hasFilter && <Pressable accessibilityRole="button" onPress={clear} style={s.filterButton}><Text style={s.accentText}>Clear filters</Text></Pressable>}</View>
      </>}
      renderItem={({ item: d }) => <DeviceRow id={d.id} name={d.values[0]} subtitle={`iOS ${d.values[1]} / ${d.values[5]}`} trailing={d.holder ? `${d.holder.person} / ${d.holder.team}` : 'Available'} onPress={openDevice} />}
      ListEmptyComponent={<View style={s.empty}><AppIcon name="phone-portrait-outline" size={36} color={colors.muted} /><Text style={s.rowTitle}>{hasFilter ? 'No matching phones' : 'No phones registered'}</Text><Button title={hasFilter ? 'Show all phones' : 'Register a new phone'} primary onPress={hasFilter ? clear : startRegistration} /></View>} />
    <View style={s.toolbar}><Text style={s.small}>{devices.filter(d => !d.holder).length} available</Text><Button title="Scan device label" icon="scan-outline" onPress={() => navigation.navigate('Scan', { registration: true })} /></View>
  </Page>;
}

function Details({ navigation, route }: Props<'Details'>) {
  const { devices, commit, busy } = useContext(Store), d = devices.find(d => d.id === route.params.id);
  if (!d) return <Page><View style={s.content}><Text style={s.title}>Device not found</Text><Button title="All devices" onPress={() => navigation.popTo('Devices')} /></View></Page>;
  function returnPhone() { Alert.alert('Return phone?', `${d!.values[0]} will become available.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Confirm return', onPress: async () => { try { await commit(devices.map(v => v.id === d!.id ? handover(v, null, 'Local coordinator') : v)); } catch (error) { showError(error); } } }]); }
  return <Page><ScrollView style={s.flex} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.content}><Text style={s.title}>{d.values[0]}</Text><Text style={s.subtitle}>iOS {d.values[1]} / {d.values[5]}</Text><View style={s.group}><View style={s.holder}><View style={s.holderIcon}><AppIcon name={d.holder ? 'person-outline' : 'phone-portrait-outline'} size={22} color={d.holder?.team === 'QA' ? colors.pink : d.holder?.team === 'Design' ? colors.orange : colors.accent} /></View><View style={s.flex}><Text style={s.rowTitle}>{d.holder?.person || 'Available'}</Text><Text style={s.small}>{d.holder ? `${d.holder.team} team` : 'No current holder'}</Text></View></View><View style={s.actionRow}><Button title={d.holder ? 'Transfer phone' : 'Assign phone'} primary disabled={busy} onPress={() => navigation.navigate('Assign', { id: d.id })} /></View>{d.holder && <View style={s.actionRow}><Button title="Return phone" disabled={busy} onPress={returnPhone} /></View>}</View><Section title="DEVICE INFORMATION" /><View style={s.group}>{fieldNames.slice(1).map((field, i) => <View style={s.spec} key={field}><Text style={s.small}>{field}</Text><Text selectable style={s.specValue}>{d.values[i + 1]}</Text></View>)}</View><View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}><View style={s.flex}><Button title="Edit" icon="create-outline" onPress={() => navigation.navigate('Form', { id: d.id })} /></View><View style={s.flex}><Button title="Share" icon="share-outline" onPress={() => void Share.share({ message: `${d.values[0]}\nSerial: ${d.values[4]}\ndevice-register://device/${d.id}` }).catch(showError)} /></View></View><Section title="HANDOVER HISTORY" /><View style={s.group}>{d.history.length ? d.history.map((event, i) => <View style={s.event} key={`${event.at}-${i}`}><Text style={s.body}>{event.text}</Text><Text style={s.small}>{new Date(event.at).toLocaleString()} / {event.actor}</Text></View>) : <View style={s.spec}><Text style={s.small}>No handovers yet.</Text></View>}</View></ScrollView></Page>;
}

function Assign({ navigation, route }: Props<'Assign'>) {
  const { devices, commit, busy } = useContext(Store), d = devices.find(d => d.id === route.params.id)!;
  const [team, setTeam] = useState<Team>(d.holder?.team || 'Mobile'), [person, setPerson] = useState('');
  function confirm() { const next: Holder = { team, person }; Alert.alert('Confirm handover', `${d.values[0]}\n\nFrom: ${d.holder?.person || 'Unassigned'}\nTo: ${person} / ${team}`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Confirm', onPress: async () => { try { await commit(devices.map(v => v.id === d.id ? handover(v, next, 'Local coordinator') : v)); navigation.goBack(); } catch (error) { showError(error); } } }]); }
  return <Page><ScrollView style={s.flex} contentContainerStyle={s.content}><Text style={s.rowTitle}>{d.values[0]}</Text><Section title="TEAM" /><NativeSegments values={['Mobile (5)', 'QA (10)', 'Design (4)']} index={['Mobile', 'QA', 'Design'].indexOf(team)} onChange={index => { setTeam((['Mobile', 'QA', 'Design'] as const)[index]); setPerson(''); }} /><Section title="PERSON" /><View style={s.group}>{members[team].map(p => <Pressable key={p} accessibilityRole="radio" accessibilityState={{ checked: person === p }} onPress={() => setPerson(p)} style={s.person}><View style={s.flex}><Text style={s.body}>{p}</Text>{d.holder?.person === p && <Text style={s.small}>Current holder</Text>}</View>{person === p && <AppIcon name="checkmark" size={24} color={colors.accent} />}</Pressable>)}</View></ScrollView><View style={s.bottom}><Button title={busy ? 'Saving...' : d.holder ? 'Transfer phone' : 'Assign phone'} primary disabled={!person || person === d.holder?.person || busy} onPress={confirm} /></View></Page>;
}

function Form({ navigation, route }: Props<'Form'>) {
  const { devices, commit, busy } = useContext(Store), d = devices.find(d => d.id === route.params.id);
  const [values, setValues] = useState(d?.values || route.params.values || fieldNames.map(() => '')), [identifiers, setIdentifiers] = useState<DeviceIdentifiers>(d?.identifiers || route.params.identifiers || {}), [barcode, setBarcode] = useState(d?.barcode || route.params.barcode || ''), [error, setError] = useState('');
  const scroll = useRef<ScrollView>(null);
  const original = useRef({ values: [...values], identifiers: { ...identifiers }, barcode });
  const allowLeave = useRef(false);
  const dirty = values.some((v, i) => v !== original.current.values[i]) || JSON.stringify(identifiers) !== JSON.stringify(original.current.identifiers) || barcode !== original.current.barcode;
  usePreventRemove((dirty || busy) && !allowLeave.current, ({ data }) => {
    if (allowLeave.current) { navigation.dispatch(data.action); return; }
    if (busy) { Alert.alert('Saving phone', 'Please wait for the save to finish.'); return; }
    Alert.alert('Discard changes?', 'Your phone information has not been saved.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) }]);
  });
  useEffect(() => { if (route.params.barcode) setBarcode(route.params.barcode); if (route.params.values) setValues(route.params.values); if (route.params.identifiers) setIdentifiers(route.params.identifiers); }, [route.params.barcode, route.params.values, route.params.identifiers]);
  async function submit() {
    const cleaned = values.map(v => v.trim()), issue = validateDevice(devices, cleaned, barcode, d?.id);
    if (issue) { setError(issue); scroll.current?.scrollTo({ y: 0 }); return; }
    const event = { text: d ? 'Device information updated' : 'Device registered', actor: 'Local coordinator', at: new Date().toISOString() };
    const saved: Device = { id: d?.id || `MOB-${Date.now()}`, values: cleaned, barcode: barcode.trim(), barcodeAliases: d?.barcodeAliases || [], identifiers, holder: d?.holder || null, history: [event, ...(d?.history || [])] };
    try { await commit(d ? devices.map(v => v.id === d.id ? saved : v) : [...devices, saved]); allowLeave.current = true; if (d) navigation.goBack(); else navigation.reset(deviceDetailState(saved.id)); } catch (error) { showError(error); }
  }
  return <Page><KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}><ScrollView style={s.flex} ref={scroll} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!d && <Text style={s.subtitle}>Scanned labels are filled in automatically. Add only details that are not printed on the labels.</Text>}<Section title="DEVICE INFORMATION" /><View style={s.group}>{fieldNames.map((field, i) => <View style={s.field} key={field}><Text style={s.label}>{field}</Text><TextInput accessibilityLabel={field} value={values[i]} onChangeText={value => setValues(old => old.map((v, n) => n === i ? value : v))} placeholder={i === 0 ? 'e.g. iPhone 16 Plus White' : undefined} placeholderTextColor={colors.muted} style={s.input} autoCorrect={false} autoCapitalize={i > 2 ? 'characters' : 'none'} /></View>)}</View><Section title="SCANNED IDENTIFIERS" /><View style={s.group}>{(['imei', 'imei2', 'eid', 'upc'] as const).map(key => <View style={s.field} key={key}><Text style={s.label}>{key === 'imei2' ? 'IMEI 2' : key.toUpperCase()}</Text><TextInput accessibilityLabel={key} value={identifiers[key] || ''} onChangeText={value => setIdentifiers(old => ({ ...old, [key]: value }))} style={s.input} autoCorrect={false} autoCapitalize="characters" /></View>)}</View><Section title="DEVICE LABEL" /><View style={s.group}><View style={s.field}><Text style={s.label}>Barcode or asset code</Text><TextInput accessibilityLabel="Barcode or asset code" value={barcode} onChangeText={setBarcode} style={s.input} autoCorrect={false} autoCapitalize="none" /></View></View></ScrollView><View style={s.bottom}><Button title={busy ? 'Saving...' : 'Save phone'} primary disabled={busy} onPress={() => void submit()} /></View></KeyboardAvoidingView></Page>;
}

function Scan({ navigation, route }: Props<'Scan'>) {
  const { devices } = useContext(Store), focused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState('');
  const [torch, setTorch] = useState(false);
  const [paused, setPaused] = useState(false);
  const [captured, setCaptured] = useState(() => parseScannedDevice(''));
  const locked = useRef(false);
  const capturedCodes = useRef(new Set<string>());
  const capturedRef = useRef(captured);
  const duplicateAlert = useRef(false);

  function identityCodes(scanned: typeof captured) {
    return [
      scanned.values[4],
      scanned.identifiers.imei,
      scanned.identifiers.imei2,
      scanned.identifiers.eid,
      scanned.barcode && scanned.barcode !== scanned.identifiers.upc ? scanned.barcode : undefined,
    ].filter((value): value is string => !!value);
  }

  function resetCapture() {
    const empty = parseScannedDevice('');
    capturedRef.current = empty;
    setCaptured(empty);
    capturedCodes.current.clear();
    duplicateAlert.current = false;
    setPaused(false);
  }

  function showDuplicate(name: string, existing?: Device) {
    if (duplicateAlert.current) return;
    duplicateAlert.current = true;
    setPaused(true);
    Alert.alert('Already registered', `${name} is already in your register.`, [
      { text: 'Keep scanning', onPress: resetCapture },
      existing
        ? { text: 'View phone', onPress: () => navigation.reset(deviceDetailState(existing.id)) }
        : { text: 'Dismiss', onPress: resetCapture },
    ], { cancelable: false });
  }

  function checkCloudDuplicate(scanned: typeof captured) {
    const [serial, imei, imei2, eid, barcode] = identityCodes(scanned);
    void checkRegisteredIdentity({ serial, imei, imei2, eid, barcode }).then(match => {
      if (match) showDuplicate(match.name);
    });
  }

  function lookup(raw: string, type = 'manual') {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (route.params?.registration) {
      const key = trimmed.toLowerCase();
      if (capturedCodes.current.has(key)) return;
      capturedCodes.current.add(key);
      const profile = isProductBarcode(type) ? undefined : lookupScannedProfile(raw);
      const next = profile
        ? {
            barcode: profile.barcode || capturedRef.current.barcode,
            values: capturedRef.current.values.map((value, index) => value || profile.values[index]),
            identifiers: { ...capturedRef.current.identifiers, ...profile.identifiers },
          }
        : mergeScannedDevice(capturedRef.current, raw, type);
      capturedRef.current = next;
      setCaptured(next);
      const existing = findRegisteredDevice(devices, identityCodes(next));
      if (existing) {
        showDuplicate(existing.values[0], existing);
      } else {
        checkCloudDuplicate(next);
      }
      return;
    }
    if (locked.current) return;
    locked.current = true;
    setPaused(true);
    if (isProductBarcode(type)) {
      Alert.alert('Product barcode scanned', `Read: ${raw.trim()}\n\nScan the Serial Number or IMEI barcode to identify an individual phone.`, [{ text: 'Scan again', onPress: () => { locked.current = false; setPaused(false); } }], { cancelable: false });
      return;
    }
    const found = findDevice(devices, raw);
    if (found) navigation.reset(deviceDetailState(found.id));
    else navigation.replace('MatchScan', { code: raw.trim(), type });
  }

  const capturedCount = [captured.values[4], captured.identifiers.imei, captured.identifiers.imei2, captured.identifiers.eid, captured.identifiers.upc].filter(Boolean).length;
  function useCaptured() {
    const existing = findRegisteredDevice(devices, identityCodes(captured));
    if (existing) {
      Alert.alert('Already registered', `${existing.values[0]} is already in your register.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'View phone', onPress: () => navigation.reset(deviceDetailState(existing.id)) },
      ]);
      return;
    }
    navigation.replace('Form', captured);
  }

  return (
    <Page>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
        <ScrollView style={s.flex} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
          {permission?.granted && focused && !paused ? (
            <CameraView style={s.camera} facing="back" enableTorch={torch} barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'code93', 'aztec', 'codabar', 'itf14', 'ean13', 'ean8', 'upc_a', 'upc_e', 'datamatrix', 'pdf417'] }} onBarcodeScanned={({ data, type }) => lookup(data, type)} />
          ) : (
            <View style={[s.camera, s.center]}>
              <AppIcon name="scan-outline" size={48} color={colors.accent} />
              <Text style={s.small}>{paused ? 'Label captured' : 'Camera access is needed to scan'}</Text>
              {!permission?.granted && <Button title={permission?.canAskAgain === false ? 'Open settings' : 'Enable camera'} onPress={() => { if (permission?.canAskAgain === false) void Linking.openSettings(); else void requestPermission(); }} />}
            </View>
          )}
          <View style={s.filterRow}>
            <Text style={[s.small, s.flex]}>{route.params?.registration ? 'Scan box barcodes one by one. Each code is captured once.' : 'Scan the Serial Number or IMEI label.'}</Text>
            {permission?.granted && !paused && <IconButton name={torch ? 'flash' : 'flash-outline'} label={torch ? 'Flash off' : 'Flash on'} onPress={() => setTorch(!torch)} />}
          </View>
          {route.params?.registration && capturedCount > 0 ? (
            <>
              <Section title={`CAPTURED (${capturedCount})`} />
              <View style={s.group}>
                <View style={s.spec}><Text style={s.small}>Serial Number</Text><Text style={s.specValue}>{captured.values[4] || 'Not scanned yet'}</Text></View>
                <View style={s.spec}><Text style={s.small}>IMEI / IMEI 2</Text><Text style={s.specValue}>{[captured.identifiers.imei, captured.identifiers.imei2].filter(Boolean).join(' / ') || 'Not scanned yet'}</Text></View>
                <View style={s.spec}><Text style={s.small}>EID / UPC</Text><Text style={s.specValue}>{[captured.identifiers.eid, captured.identifiers.upc].filter(Boolean).join(' / ') || 'Not scanned yet'}</Text></View>
              </View>
              <View style={{ marginTop: 20 }}><Button title="Review captured details" primary onPress={useCaptured} /></View>
            </>
          ) : null}
          {!route.params?.registration ? (
            <>
              <Section title="OR ENTER THE CODE" />
              <View style={s.group}><View style={s.field}><Text style={s.label}>Barcode, serial or asset ID</Text><TextInput accessibilityLabel="Barcode, serial or asset ID" style={s.input} value={code} onChangeText={setCode} autoCorrect={false} autoCapitalize="none" /></View></View>
              <View style={{ marginTop: 20 }}><Button title="Find phone" primary disabled={!code.trim() || paused} onPress={() => lookup(code)} /></View>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Page>
  );
}

function MatchScan({ navigation, route }: Props<'MatchScan'>) {
  const { devices, commit, busy } = useContext(Store), { code } = route.params;
  const [query, setQuery] = useState('');
  const matches = useMemo(() => filterDevices(devices, query, 'All', 'All'), [devices, query]);
  const link = useCallback((id: string) => {
    const device = devices.find(d => d.id === id);
    if (!device) return;
    Alert.alert('Link this label?', `Check that the box belongs to ${device.values[0]}.\n\nRegistered serial: ${device.values[4]}\nScanned code: ${code}`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Link phone', onPress: async () => { try { await commit(linkBarcode(devices, device.id, code, route.params.type, 'Local coordinator')); navigation.reset(deviceDetailState(device.id)); } catch (error) { showError(error); } } }]);
  }, [devices, code, route.params.type, commit, navigation]);
  return <Page><FlatList style={s.flex} data={matches} keyExtractor={d => d.id} contentInsetAdjustmentBehavior="automatic" keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={s.content} ListHeaderComponent={<><Text style={s.title}>New device label</Text><Text style={s.subtitle}>Register a phone or link this label to one you already have.</Text><View style={s.group}><View style={s.spec}><Text style={s.small}>Scanned code</Text><Text selectable style={s.specValue}>{code}</Text></View></View><Section title={`EXISTING PHONES (${devices.length})`} /><View style={s.search}><AppIcon name="search-outline" size={20} color={colors.muted} /><TextInput accessibilityLabel="Search existing phones" placeholder="Search existing phones" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} style={s.searchInput} />{!!query && <IconButton name="close-circle" label="Clear search" onPress={() => setQuery('')} />}</View></>} renderItem={({ item: d }) => <DeviceRow id={d.id} name={d.values[0]} subtitle={`Serial: ${d.values[4]}`} onPress={link} disabled={busy} />} ListEmptyComponent={<View style={s.empty}><Text style={s.small}>{query ? 'No matching phones.' : 'No phones registered yet.'}</Text></View>} /><View style={s.bottom}><Button title="Register a new phone" primary icon="add" disabled={busy} onPress={() => navigation.replace('Form', { barcode: code })} /><Button title="Scan another label" icon="scan-outline" disabled={busy} onPress={() => navigation.replace('Scan')} /></View></Page>;
}
