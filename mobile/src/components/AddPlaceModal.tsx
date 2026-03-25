import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { DatePickerField } from './DatePickerField';
import { PrimaryButton } from './PrimaryButton';
import { TextField } from './TextField';
import { formatGooglePlaceRatingLine, getPlaceDetails, searchPlaces } from '../services/places';
import { parseTripYmd } from '../utils/tripSchedule';
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
  onAdd: (params: {
    locationName: string;
    coords: { latitude: number; longitude: number };
    /** YYYY-MM-DD — yalnızca pickStopDate true iken */
    stopDate?: string;
  }) => Promise<void>;
  /** all: işletme+yer, regions: il/ilçe ağırlıklı, geocode: adres satırı */
  searchMode?: PlacesSearchMode;
  /** false: sadece konum (ör. taşıma); true: rota aralığında gün seçimi */
  pickStopDate?: boolean;
  /** pickStopDate için zorunlu: başlangıç / bitiş YYYY-MM-DD ve varsayılan gün */
  tripDateRange?: { start: string; end: string; defaultDay: string };
};

export function AddPlaceModal(props: Props) {
  const appTheme = useAppTheme();
  const styles = useMemo(() => createAddPlaceStyles(appTheme), [appTheme]);
  const [keyboardBottomInset, setKeyboardBottomInset] = useState(0);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PlaceDetailsType | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planDay, setPlanDay] = useState<Date | null>(null);
  const pickDate = Boolean(props.pickStopDate && props.tripDateRange);
  const range = props.tripDateRange;

  useEffect(() => {
    if (!props.visible) {
      setQuery('');
      setSuggestions([]);
      setSelected(null);
      setError(null);
      setPlanDay(null);
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

  useEffect(() => {
    const tr = props.tripDateRange;
    if (!props.visible || !pickDate || !tr) return;
    const clamp = (d: Date) => {
      const min = parseTripYmd(tr.start);
      const max = parseTripYmd(tr.end);
      if (!min || !max) return d;
      const t = d.getTime();
      if (t < min.getTime()) return min;
      if (t > max.getTime()) return max;
      return d;
    };
    const fromDefault = parseTripYmd(tr.defaultDay) ?? parseTripYmd(tr.start) ?? new Date();
    setPlanDay(clamp(fromDefault));
  }, [props.visible, pickDate, props.tripDateRange?.start, props.tripDateRange?.end, props.tripDateRange?.defaultDay]);

  useEffect(() => {
    if (!props.visible) {
      setKeyboardBottomInset(0);
      return;
    }
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subShow = Keyboard.addListener(showEvt, (e) => {
      const h = e.endCoordinates?.height;
      setKeyboardBottomInset(typeof h === 'number' && h > 0 ? h : 0);
    });
    const subHide = Keyboard.addListener(hideEvt, () => setKeyboardBottomInset(0));
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [props.visible]);

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

  function ymdFromDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  async function handleAdd() {
    if (!selected) return;
    if (pickDate && !planDay) {
      setError('Önce bu durak için gün seç.');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await props.onAdd({
        locationName: selected.name,
        coords: { latitude: selected.latitude, longitude: selected.longitude },
        ...(pickDate && planDay ? { stopDate: ymdFromDate(planDay) } : {}),
        ...(selected.rating != null && selected.rating > 0 ? { placeRating: selected.rating } : {}),
        ...(selected.userRatingsTotal != null && selected.userRatingsTotal > 0
          ? { placeUserRatingsTotal: selected.userRatingsTotal }
          : {}),
      });
      props.onClose();
    } catch (e: any) {
      setError(e?.message || 'Durak eklenemedi.');
    } finally {
      setAdding(false);
    }
  }

  const selectedRatingLine = selected
    ? formatGooglePlaceRatingLine(selected.rating, selected.userRatingsTotal)
    : null;

  const scrollBottomPad = appTheme.space.xl + 24 + keyboardBottomInset;

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="slide"
      onRequestClose={props.onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.overlay} onPress={props.onClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator
              nestedScrollEnabled
              bounces={false}
              contentContainerStyle={[styles.sheetScrollContent, { paddingBottom: scrollBottomPad }]}
            >
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
                  {selectedRatingLine ? (
                    <Text style={styles.ratingLine}>{selectedRatingLine}</Text>
                  ) : null}
                  {pickDate && range ? (
                    <>
                      <View style={{ height: appTheme.space.md }} />
                      <DatePickerField
                        label="Bu durak hangi gün?"
                        value={planDay}
                        onChange={setPlanDay}
                        minDate={parseTripYmd(range.start) ?? undefined}
                        maxDate={parseTripYmd(range.end) ?? undefined}
                      />
                    </>
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
                    <ScrollView
                      style={styles.list}
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled"
                    >
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
            </ScrollView>
          </Pressable>
        </Pressable>
      </View>
    </Modal>
  );
}

function createAddPlaceStyles(t: AppTheme) {
  return StyleSheet.create({
    modalRoot: { flex: 1 },
    overlay: {
      flex: 1,
      backgroundColor: t.color.overlayDark,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: t.color.surface,
      borderTopLeftRadius: t.radius.xl,
      borderTopRightRadius: t.radius.xl,
      paddingHorizontal: t.space.lg,
      paddingTop: t.space.lg,
      maxHeight: '88%',
      borderTopWidth: 3,
      borderTopColor: t.color.primary,
      ...t.shadowCard,
    },
    sheetScrollContent: {
      flexGrow: 1,
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
    ratingLine: {
      color: t.color.primaryDark,
      fontSize: t.font.small,
      fontWeight: '800',
      marginTop: 6,
    },
    changeBtn: { marginTop: t.space.sm, alignSelf: 'flex-start' },
    changeBtnText: { color: t.color.primary, fontSize: t.font.small, fontWeight: '700' },
  });
}
