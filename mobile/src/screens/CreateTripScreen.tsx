import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { DatePickerField } from '../components/DatePickerField';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { auth } from '../lib/firebase';
import { createTrip } from '../services/trips';
import { theme } from '../theme';

export function CreateTripScreen(props: { onCreated: (tripId: string) => void; onBack: () => void }) {
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  function toISODate(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  async function submit() {
    setError(undefined);
    const t = title.trim();
    if (!t) {
      setError('Rota adı girin.');
      return;
    }
    if (!startDate) {
      setError('Başlangıç tarihi seçin.');
      return;
    }
    if (!endDate) {
      setError('Bitiş tarihi seçin.');
      return;
    }
    if (endDate.getTime() < startDate.getTime()) {
      setError('Bitiş tarihi başlangıçtan önce olamaz.');
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setError('Oturum bulunamadı.');
      return;
    }
    setLoading(true);
    try {
      const tripId = await createTrip({
        adminId: uid,
        title: t,
        startDate: toISODate(startDate),
        endDate: toISODate(endDate),
      });
      props.onCreated(tripId);
    } catch (e: any) {
      setError(e?.message || 'Rota oluşturulamadı.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable onPress={props.onBack} style={styles.backRow}>
          <Text style={styles.backText}>← Geri</Text>
        </Pressable>
        <View style={styles.header}>
          <Text style={styles.title}>Yeni rota</Text>
          <Text style={styles.sub}>Rota adı ve tarih aralığını girin.</Text>
        </View>

        <View style={styles.card}>
          <TextField
            label="Rota adı"
            value={title}
            placeholder="Örn. Bolu hafta sonu"
            onChangeText={setTitle}
            errorText={error}
            autoFocus
          />
          <View style={{ height: theme.space.sm }} />
          <DatePickerField
            label="Başlangıç tarihi"
            value={startDate}
            onChange={(d) => {
              setStartDate(d);
              if (d && endDate && endDate.getTime() < d.getTime()) setEndDate(d);
            }}
          />
          <View style={{ height: theme.space.sm }} />
          <DatePickerField
            label="Bitiş tarihi"
            value={endDate}
            minDate={startDate ?? undefined}
            onChange={setEndDate}
          />
          <View style={{ height: theme.space.md }} />
          <PrimaryButton title="Oluştur" onPress={submit} loading={loading} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 8, marginBottom: theme.space.sm },
  backText: { color: theme.color.primary, fontSize: theme.font.body, fontWeight: '700' },
  header: { gap: 8, marginBottom: theme.space.lg },
  title: { color: theme.color.text, fontSize: theme.font.h1, fontWeight: '800' },
  sub: { color: theme.color.muted, fontSize: theme.font.body, lineHeight: 22 },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
});
