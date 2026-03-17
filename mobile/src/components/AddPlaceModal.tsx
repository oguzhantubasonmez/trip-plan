import { useCallback, useEffect, useState } from 'react';
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
import type { PlaceDetails as PlaceDetailsType, PlacePrediction } from '../services/places';
import { theme } from '../theme';

const DEBOUNCE_MS = 400;

type Props = {
  visible: boolean;
  onClose: () => void;
  onAdd: (params: { locationName: string; coords: { latitude: number; longitude: number } }) => Promise<void>;
};

export function AddPlaceModal(props: Props) {
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
      searchPlaces(query)
        .then(setSuggestions)
        .catch((e) => {
          setError(e?.message || 'Arama başarısız.');
          setSuggestions([]);
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [props.visible, query]);

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
          <Text style={styles.title}>Google Maps'tan yer ekle</Text>
          <Text style={styles.sub}>Yer adı yazın (örn. Selçuk, İzmir), listeden seçin ve Ekle'ye basın.</Text>

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
              <View style={{ height: theme.space.md }} />
              <PrimaryButton title="Ekle" onPress={handleAdd} loading={adding} />
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

          <View style={{ height: theme.space.md }} />
          <PrimaryButton title="Kapat" onPress={props.onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.color.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.space.lg,
    paddingBottom: theme.space.xl + 24,
    maxHeight: '85%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.color.border,
    alignSelf: 'center',
    marginBottom: theme.space.md,
  },
  title: { color: theme.color.text, fontSize: theme.font.h2, fontWeight: '800', marginBottom: 4 },
  sub: { color: theme.color.muted, fontSize: theme.font.small, marginBottom: theme.space.md },
  error: { color: theme.color.danger, fontSize: theme.font.small, marginVertical: theme.space.sm },
  muted: { color: theme.color.muted, fontSize: theme.font.small, marginVertical: theme.space.sm },
  list: { maxHeight: 220, marginVertical: theme.space.sm },
  suggestionRow: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.subtle,
  },
  suggestionText: { color: theme.color.text, fontSize: theme.font.body },
  selected: {
    marginTop: theme.space.sm,
    padding: theme.space.md,
    backgroundColor: theme.color.inputBg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  selectedName: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '800' },
  selectedAddr: { color: theme.color.muted, fontSize: theme.font.small, marginTop: 4 },
  changeBtn: { marginTop: theme.space.sm, alignSelf: 'flex-start' },
  changeBtnText: { color: theme.color.primary, fontSize: theme.font.small, fontWeight: '700' },
});
