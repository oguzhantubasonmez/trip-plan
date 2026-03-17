import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { auth } from '../lib/firebase';
import { createGroup } from '../services/groups';
import { theme } from '../theme';

export function CreateGroupScreen(props: {
  onBack: () => void;
  onCreated: (groupId: string) => void;
}) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = auth.currentUser?.uid;

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed || !uid) return;
    setLoading(true);
    setError(null);
    try {
      const groupId = await createGroup(uid, trimmed);
      props.onCreated(groupId);
    } catch (e: any) {
      setError(e?.message || 'Grup oluşturulamadı.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Pressable onPress={props.onBack} style={styles.backRow}>
        <Text style={styles.backText}>← Geri</Text>
      </Pressable>
      <View style={styles.header}>
        <Text style={styles.title}>Yeni grup</Text>
        <Text style={styles.sub}>Grup adını gir. Oluşturduktan sonra üye ekleyebilirsin.</Text>
      </View>
      <TextField
        label="Grup adı"
        value={name}
        placeholder="Örn. Aile, İş arkadaşları"
        onChangeText={setName}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={{ height: theme.space.md }} />
      <PrimaryButton
        title="Oluştur"
        onPress={handleCreate}
        loading={loading}
        disabled={!name.trim()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 8, marginBottom: theme.space.sm },
  backText: { color: theme.color.primary, fontSize: theme.font.body, fontWeight: '700' },
  header: { gap: 6, marginBottom: theme.space.lg },
  title: { color: theme.color.text, fontSize: theme.font.h1, fontWeight: '900' },
  sub: { color: theme.color.muted, fontSize: theme.font.body, lineHeight: 22 },
  error: { color: theme.color.danger, fontSize: theme.font.small, marginTop: theme.space.sm },
});
