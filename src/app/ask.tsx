import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { aiErrorMessage, hasAiKey } from '@/lib/ai';
import { ask, clearConversation, dropUnanswered, loadConversation, textOf, type Conversation } from '@/lib/chat';
import { Settings } from '@/lib/settings';
import { formatTime } from '@/lib/uv';

const STARTERS = [
  'What tends to come before my flares?',
  'How is my sleep affecting how I feel?',
  'How are my labs trending?',
  'Summarize the last 3 months for my rheumatologist',
  'What should I ask at my next appointment?',
];

export default function AskScreen() {
  const theme = useTheme();
  const [convo, setConvo] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);

  useFocusEffect(
    useCallback(() => {
      loadConversation().then(setConvo);
    }, []),
  );

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || sending) return;
    setDraft('');
    setSending(true);
    // Show the question immediately.
    setConvo((c) =>
      c
        ? { ...c, messages: [...c.messages, { role: 'user', content: question, at: Date.now() }] }
        : { id: 'pending', startedAt: Date.now(), context: '', messages: [{ role: 'user', content: question, at: Date.now() }] },
    );
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    try {
      const current = await loadConversation();
      const updated = await ask(question, current);
      setConvo(updated);
    } catch (e) {
      const saved = await loadConversation();
      setConvo(saved ? await dropUnanswered(saved) : null);
      setDraft(question);
      Alert.alert("Couldn't get an answer", aiErrorMessage(e));
    } finally {
      setSending(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  const newChat = () => {
    if (!convo?.messages.length) return;
    const reset = async () => {
      await clearConversation();
      setConvo(null);
    };
    if (Platform.OS === 'web') return reset();
    Alert.alert('Start a new chat?', 'This clears the current conversation. Your next question will use your latest data.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'New chat', onPress: reset },
    ]);
  };

  const messages = convo?.messages ?? [];

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}>
        <View style={[styles.header, Platform.OS === 'web' && styles.webTop]}>
          <ThemedText type="subtitle">Ask MyLupus</ThemedText>
          {messages.length > 0 && (
            <Pressable onPress={newChat} hitSlop={10} style={[styles.newChat, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="smallBold" style={{ color: theme.accent }}>
                New chat
              </ThemedText>
            </Pressable>
          )}
        </View>

        <ScrollView
          ref={scroll}
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
          <View style={styles.inner}>
            {!hasAiKey ? (
              <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="smallBold">Claude API key needed</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Add EXPO_PUBLIC_ANTHROPIC_API_KEY to the .env.local file on your laptop, then restart the app with
                  --clear.
                </ThemedText>
              </View>
            ) : messages.length === 0 ? (
              <>
                <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText>
                    Hi {Settings.name}. Ask me anything about your logged history: symptoms, sleep, meals, flares,
                    medications, labs, and UV.
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    I look for patterns in your own data and can help you prepare for appointments. I can&apos;t
                    diagnose or change your treatment. Each question uses a little API credit (about 1–3¢).
                  </ThemedText>
                </View>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  TRY ASKING
                </ThemedText>
                {STARTERS.map((q) => (
                  <Pressable
                    key={q}
                    onPress={() => send(q)}
                    style={({ pressed }) => [
                      styles.starter,
                      { borderColor: theme.backgroundSelected, backgroundColor: theme.backgroundElement, opacity: pressed ? 0.6 : 1 },
                    ]}>
                    <ThemedText type="small">{q}</ThemedText>
                  </Pressable>
                ))}
              </>
            ) : (
              <>
                {convo?.startedAt && convo.id !== 'pending' ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                    Using your data as of {formatTime(new Date(convo.startedAt))}. Tap New chat to include newer entries.
                  </ThemedText>
                ) : null}
                {messages.map((m, i) => {
                  const mine = m.role === 'user';
                  const text = textOf(m);
                  if (!text) return null;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.bubble,
                        mine
                          ? [styles.mine, { backgroundColor: theme.accent }]
                          : [styles.theirs, { backgroundColor: theme.backgroundElement }],
                      ]}>
                      <ThemedText selectable style={mine ? styles.mineText : undefined}>
                        {text}
                      </ThemedText>
                    </View>
                  );
                })}
                {sending && (
                  <View style={[styles.bubble, styles.theirs, styles.thinking, { backgroundColor: theme.backgroundElement }]}>
                    <ActivityIndicator size="small" />
                    <ThemedText type="small" themeColor="textSecondary">
                      Looking through your history…
                    </ThemedText>
                  </View>
                )}
              </>
            )}
          </View>
        </ScrollView>

        {hasAiKey && (
          <View style={[styles.inputBar, { borderColor: theme.backgroundSelected, backgroundColor: theme.background }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Ask about your history…"
              placeholderTextColor={theme.textSecondary}
              multiline
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
            <Pressable
              onPress={() => send(draft)}
              disabled={!draft.trim() || sending}
              style={[styles.send, { backgroundColor: theme.accent, opacity: !draft.trim() || sending ? 0.4 : 1 }]}>
              <ThemedText type="smallBold" style={styles.mineText}>
                Send
              </ThemedText>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  webTop: { paddingTop: 80 },
  newChat: { paddingVertical: Spacing.one + 2, paddingHorizontal: Spacing.three, borderRadius: 999 },
  scroll: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.four, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  card: { borderRadius: 20, padding: Spacing.three, gap: Spacing.two },
  starter: { borderWidth: 1, borderRadius: 14, paddingVertical: Spacing.two + 2, paddingHorizontal: Spacing.three },
  center: { textAlign: 'center' },
  bubble: { borderRadius: 18, paddingVertical: Spacing.two + 2, paddingHorizontal: Spacing.three, maxWidth: '88%' },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', borderBottomLeftRadius: 6 },
  mineText: { color: '#fff' },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: BottomTabInset + Spacing.two,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderRadius: 18,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two + 2,
    paddingBottom: Spacing.two + 2,
    fontSize: 16,
  },
  send: { borderRadius: 18, paddingVertical: Spacing.two + 2, paddingHorizontal: Spacing.three },
});
