import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import { TextField } from './TextField';
import { getPlaceDetails, searchPlaces } from '../services/places';
import type {
  PlaceDetails as PlaceDetailsType,
  PlacePrediction,
  PlacesSearchMode,
} from '../services/places';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

const DEBOUNCE_MS = 400;

type Props = {
  visible: boolean;
  onClose: () => void;
  onAdd: (params: { locationName: string; coords: { latitude: number; longitude: number } }) => Promise<void>;
  /** all: işletme+yer, regions: il/ilçe ağırlıklı, geocode: adres satırı */
  searchMode?: PlacesSearchMode;
};

export function AddPlaceModal(props: Props) {
  const appTheme = useAppTheme();
  const styles = useMemo(() => createAddPlaceStyles(appTheme), [appTheme]);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PlaceDetailsType | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.visible) {
      setQuery('');
      setSuggestions([]);
      setSelected(null);
      setError(null);
      return;
    }
    const t = setTimeout(() => {
      if (!query.trim()) {
        setSuggestions([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      searchPlaces(query, props.searchMode ?? 'all')
        .then(setSuggestions)
        .catch((e) => {
          setError(e?.message || 'Arama başarısız.');
          setSuggestions([]);
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [props.visible, query, props.searchMode]);

  const handleSelect = useCallback(async (placeId: string) => {
    setLoadingDetails(true);
    setError(null);
    try {
      const details = await getPlaceDetails(placeId);
      setSelected(details);
      setSuggestions([]);
      setQuery(details.name);
    } catch (e: any) {
      setError(e?.message || 'Yer bilgisi alınamadı.');
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  async function handleAdd() {
    if (!selected) return;
    setAdding(true);
    setError(null);
    try {
      await props.onAdd({
        locationName: selected.name,
        coords: { latitude: selected.latitude, longitude: selected.longitude },
      });
      props.onClose();
    } catch (e: any) {
      setError(e?.message || 'Durak eklenemedi.');
    } finally {
      setAdding(false);
    }
  }

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="slide"
      onRequestClose={props.onClose}
    >
      <Pressable style={styles.overlay} onPress={props.onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>📍 Yer veya şehir bul</Text>
          <Text style={styles.sub}>
            Mekân, il veya adres ara; listeden seçip rotana ekle. Türkiye sonuçları önceliklidir.
          </Text>

          <TextField
            label="Yer ara"
            value={query}
            placeholder="Selçuk, İzmir"
            onChangeText={setQuery}
            autoFocus
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {loadingDetails && <ActivityIndicator style={{ marginVertical: 8 }} />}

          {selected ? (
            <View style={styles.selected}>
              <Text style={styles.selectedName}>{selected.name}</Text>
              {selected.formattedAddress ? (
                <Text style={styles.selectedAddr}>{selected.formattedAddress}</Text>
              ) : null}
              <View style={{ height: appTheme.space.md }} />
              <PrimaryButton title="📌 Rotaya ekle" variant="accent" onPress={handleAdd} loading={adding} />
              <Pressable onPress={() => setSelected(null)} style={styles.changeBtn}>
                <Text style={styles.changeBtnText}>Farklı yer seç</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {loading && <ActivityIndicator style={{ marginVertical: 8 }} />}
              {suggestions.length > 0 && !selected && (
                <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                  {suggestions.map((p) => (
                    <Pressable
                      key={p.placeId}
                      onPress={() => handleSelect(p.placeId)}
                      style={styles.suggestionRow}
                    >
                      <Text style={styles.suggestionText}>{p.description}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              {query.trim() && !loading && suggestions.length === 0 && !selected && (
                <Text style={styles.muted}>Sonuç bulunamadı. Farklı bir arama deneyin.</Text>
              )}
            </>
          )}

          <View style={{ height: appTheme.space.md }} />
          <PrimaryButton title="Kapat" variant="outline" onPress={props.onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createAddPlaceStyles(t: AppTheme) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: t.color.overlayDark,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: t.color.surface,
      borderTopLeftRadius: t.radius.xl,
      borderTopRightRadius: t.radius.xl,
      padding: t.space.lg,
      paddingBottom: t.space.xl + 24,
      maxHeight: '85%',
      borderTopWidth: 3,
      borderTopColor: t.color.primary,
      ...t.shadowCard,
    },
    handle: {
      width: 48,
      height: 5,
      borderRadius: 3,
      backgroundColor: t.color.primarySoft,
      alignSelf: 'center',
      marginBottom: t.space.md,
    },
    title: { color: t.color.text, fontSize: t.font.h2, fontWeight: '900', marginBottom: 4 },
    sub: { color: t.color.muted, fontSize: t.font.small, marginBottom: t.space.md },
    error: { color: t.color.danger, fontSize: t.font.small, marginVertical: t.space.sm },
    muted: { color: t.color.muted, fontSize: t.font.small, marginVertical: t.space.sm },
    list: { maxHeight: 220, marginVertical: t.space.sm },
    suggestionRow: {
      paddingVertical: 12,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: t.color.subtle,
    },
    suggestionText: { color: t.color.text, fontSize: t.font.body },
    selected: {
      marginTop: t.space.sm,
      padding: t.space.md,
      backgroundColor: t.color.inputBg,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    selectedName: { color: t.color.text, fontSize: t.font.body, fontWeight: '800' },
    selectedAddr: { color: t.color.muted, fontSize: t.font.small, marginTop: 4 },
    changeBtn: { marginTop: t.space.sm, alignSelf: 'flex-start' },
    changeBtnText: { color: t.color.primary, fontSize: t.font.small, fontWeight: '700' },
  });
}
