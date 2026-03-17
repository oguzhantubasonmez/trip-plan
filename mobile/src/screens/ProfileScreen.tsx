import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { auth } from '../lib/firebase';
import { getUserProfile, updateUserProfile } from '../services/userProfile';
import { theme } from '../theme';

export function ProfileScreen(props: { onBack: () => void }) {
  const uid = auth.currentUser?.uid;
  const [displayName, setDisplayName] = useState('');
  const [carConsumption, setCarConsumption] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!uid) return;
    const p = await getUserProfile(uid);
    setDisplayName(p?.displayName ?? '');
    setCarConsumption(p?.carConsumption ?? '');
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function save() {
    if (!uid) return;
    setLoading(true);
    setSaved(false);
    try {
      await updateUserProfile(uid, {
        displayName: displayName.trim() || undefined,
        carConsumption: carConsumption.trim() || undefined,
      });
      setSaved(true);
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
        <Text style={styles.title}>Profil</Text>
        <Text style={styles.sub}>Araç tüketimi yakıt maliyeti hesaplamasında kullanılır.</Text>
      </View>

      <View style={styles.card}>
        <TextField
          label="Ad / takma ad"
          value={displayName}
          placeholder="İsteğe bağlı"
          onChangeText={setDisplayName}
        />
        <View style={{ height: theme.space.sm }} />
        <TextField
          label="Araç tüketimi (L/100 km)"
          value={carConsumption}
          placeholder="Örn. 7"
          keyboardType="number-pad"
          onChangeText={setCarConsumption}
          helperText="100 km'de kaç litre yakıt tükettiğini gir (örn. 7 = 100 km'de 7 lt)."
        />
        <View style={{ height: theme.space.md }} />
        <PrimaryButton title="Kaydet" onPress={save} loading={loading} />
        {saved ? <Text style={styles.saved}>Kaydedildi.</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 8, marginBottom: theme.space.sm },
  backText: { color: theme.color.primary, fontSize: theme.font.body, fontWeight: '700' },
  header: { gap: 6, marginBottom: theme.space.lg },
  title: { color: theme.color.text, fontSize: theme.font.h1, fontWeight: '800' },
  sub: { color: theme.color.muted, fontSize: theme.font.body, lineHeight: 22 },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  saved: { color: theme.color.success, fontSize: theme.font.small, marginTop: theme.space.sm, fontWeight: '700' },
});
