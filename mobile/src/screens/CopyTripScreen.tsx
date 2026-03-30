import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { DatePickerField } from '../components/DatePickerField';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { TimePickerField } from '../components/TimePickerField';
import { auth } from '../lib/firebase';
import { copyTripWithNewSchedule, getTrip } from '../services/trips';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';
import { normalizePlanTime } from '../utils/planTime';

function parseISODate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s + 'T12:00:00');
  return isNaN(d.getTime()) ? null : d;
}

export function CopyTripScreen(props: {
  sourceTripId: string;
  onCreated: (tripId: string) => void;
  onBack: () => void;
}) {
  const appTheme = useAppTheme();
  const styles = useMemo(() => createCopyTripStyles(appTheme), [appTheme]);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const t = await getTrip(props.sourceTripId);
      if (!t) {
        setError('Kaynak rota bulunamadı.');
        return;
      }
      const baseTitle = t.title?.trim() || 'Rota';
      setTitle(`${baseTitle} (kopya)`);
      setStartDate(parseISODate(t.startDate));
      setEndDate(parseISODate(t.endDate));
      setStartTime(t.startTime ?? '');
      setEndTime(t.endTime ?? '');
    } catch (e: any) {
      setError(e?.message || 'Yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [props.sourceTripId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  function toISODate(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  async function submit() {
    setError(undefined);
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Rota adı girin.');
      return;
    }
    if (!startDate || !endDate) {
      setError('Başlangıç ve bitiş tarihlerini seçin.');
      return;
    }
    if (endDate.getTime() < startDate.getTime()) {
      setError('Bitiş tarihi başlangıçtan önce olamaz.');
      return;
    }
    const st = startTime.trim() ? normalizePlanTime(startTime) : undefined;
    const et = endTime.trim() ? normalizePlanTime(endTime) : undefined;
    if (startTime.trim() && !st) {
      setError('Başlangıç saati HH:mm formatında olmalı (örn. 09:00).');
      return;
    }
    if (endTime.trim() && !et) {
      setError('Bitiş saati HH:mm formatında olmalı (örn. 18:00).');
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setError('Oturum bulunamadı.');
      return;
    }
    setSaving(true);
    try {
      const newId = await copyTripWithNewSchedule({
        sourceTripId: props.sourceTripId,
        actorUid: uid,
        title: trimmed,
        startDate: toISODate(startDate),
        endDate: toISODate(endDate),
        startTime: st,
        endTime: et,
      });
      props.onCreated(newId);
    } catch (e: any) {
      setError(e?.message || 'Kopya oluşturulamadı.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Text style={styles.muted}>Yükleniyor...</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable onPress={props.onBack} style={styles.backRow}>
          <Text style={styles.backText}>← Geri</Text>
        </Pressable>
        <Text style={styles.screenTitle}>Rota kopyala</Text>
        <Text style={styles.hint}>
          Aynı duraklar ve mesafe/yakıt özeti yeni bir rotada oluşturulur; durak günleri seçtiğin başlangıç tarihine göre
          kayar. Yeni rotada yalnızca sensin (admin); katılımcıları tekrar ekleyebilirsin.
        </Text>

        <View style={{ height: appTheme.space.md }} />

        <TextField label="Yeni rota adı" value={title} onChangeText={setTitle} errorText={error} />
        <View style={{ height: appTheme.space.sm }} />
        <DatePickerField
          label="Yeni başlangıç tarihi"
          value={startDate}
          onChange={(d) => {
            setStartDate(d);
            if (d && endDate && endDate.getTime() < d.getTime()) setEndDate(d);
          }}
        />
        <View style={{ height: appTheme.space.sm }} />
        <DatePickerField label="Yeni bitiş tarihi" value={endDate} minDate={startDate ?? undefined} onChange={setEndDate} />
        <View style={{ height: appTheme.space.sm }} />
        <TimePickerField
          label="Plan başlangıç saati (opsiyonel)"
          value={startTime}
          onChange={setStartTime}
          allowClear
          helperText="Kaynak rotadan kopyalandı; değiştirebilir veya temizleyebilirsin."
        />
        <View style={{ height: appTheme.space.sm }} />
        <TimePickerField
          label="Plan bitiş saati (opsiyonel)"
          value={endTime}
          onChange={setEndTime}
          allowClear
          helperText="Gün içi bitiş veya dönüş."
        />

        <View style={{ height: appTheme.space.lg }} />
        <PrimaryButton title="Kopyayı oluştur" onPress={() => void submit()} loading={saving} />
      </KeyboardAvoidingView>
    </Screen>
  );
}

function createCopyTripStyles(t: AppTheme) {
  return StyleSheet.create({
    backRow: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 8, marginBottom: t.space.sm },
    backText: { color: t.color.primary, fontSize: t.font.body, fontWeight: '700' },
    screenTitle: { color: t.color.text, fontSize: t.font.h1, fontWeight: '900' },
    hint: { color: t.color.muted, fontSize: t.font.small, marginTop: 4, lineHeight: 20 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    muted: { color: t.color.muted, fontSize: t.font.body },
  });
}
