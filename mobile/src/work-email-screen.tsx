import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Button, Page, colors, s } from './ui';

const companyDomain = '@equicomtech.com';

export function WorkEmailScreen({ onAuthenticated }: { onAuthenticated: (email: string) => void }) {
  const [email, setEmail] = useState(''), [code, setCode] = useState(''), [step, setStep] = useState<'email' | 'code'>('email'), [error, setError] = useState('');
  const input = useRef<TextInput>(null);
  function continueWithEmail() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid work email address.'); input.current?.focus(); return;
    }
    const normalized = email.trim().toLowerCase();
    if (!normalized.endsWith(companyDomain)) {
      setError('Use your Equicomtech work email to continue.');
      return;
    }
    setError('');
    setStep('code');
  }
  function verifyCode() {
    if (code.trim() !== '123') {
      setError('Enter the 3-digit verification code.');
      return;
    }
    onAuthenticated(email.trim().toLowerCase());
  }
  return <Page><KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
      <Text style={s.title}>{step === 'email' ? 'Continue with work email' : 'Enter verification code'}</Text>
      <Text style={s.subtitle}>{step === 'email' ? 'Sign up or log in with your company email.' : `We sent a code to ${email.trim()}.`}</Text>
      <View style={s.group}><View style={s.field}>
        <Text style={s.label}>{step === 'email' ? 'Work email' : 'Verification code'}</Text>
        {step === 'email' ? <TextInput ref={input} accessibilityLabel="Work email" value={email} onChangeText={value => { setEmail(value); setError(''); }} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" autoComplete="email" placeholder="name@company.com" placeholderTextColor={colors.muted} returnKeyType="go" onSubmitEditing={continueWithEmail} style={s.input} /> : <TextInput ref={input} accessibilityLabel="Verification code" value={code} onChangeText={value => { setCode(value.replace(/\D/g, '').slice(0, 3)); setError(''); }} keyboardType="number-pad" autoCapitalize="none" autoCorrect={false} textContentType="oneTimeCode" autoComplete="one-time-code" placeholder="123" placeholderTextColor={colors.muted} maxLength={3} returnKeyType="done" onSubmitEditing={verifyCode} style={s.input} />}
      </View></View>
      {error ? <Text accessibilityRole="alert" style={[s.error, { marginTop: 12 }]}>{error}</Text> : null}
      <View style={{ marginTop: 24 }}><Button title={step === 'email' ? 'Send verification code' : 'Verify and continue'} icon={step === 'email' ? 'mail' : 'checkmark'} primary disabled={step === 'email' ? !email.trim() : code.length !== 3} onPress={step === 'email' ? continueWithEmail : verifyCode} /></View>
    </ScrollView>
  </KeyboardAvoidingView></Page>;
}
