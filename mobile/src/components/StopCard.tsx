import { format } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, useThemeMode } from '../ThemeContext';
import type { AppTheme } from '../theme';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DatePickerField } from './DatePickerField';
import { PrimaryButton } from './PrimaryButton';
import { StopExtraExpensesModal } from './StopExtraExpensesModal';
import { TextField } from './TextField';
import { TimePickerField } from './TimePickerField';
import {
  getGooglePlaceRatingParts,
  GOOGLE_PLACE_RATING_STAR_COLOR,
} from '../services/places';
import { updateStopTimes } from '../services/trips';
import type { Stop } from '../types/trip';
import type { EditStopPayload } from '../types/tripProposal';
import type { ExpenseType, UserProfile } from '../services/userProfile';
import {
  formatStopExtraExpenseLine,
  normalizeStopExtraExpenses,
  stopExtraTotal,
} from '../utils/stopExpenses';
import { stayMinutesBetweenTimes } from '../utils/planTime';
import { formatDrivingDurationMinutes, parseTripYmd } from '../utils/tripSchedule';

type Props = {
  stop: Stop;
  /** Giriş yapan kullanıcının profil masraf türleri (durakta seçim için) */
  expenseTypes: ExpenseType[];
  isAdmin: boolean;
  /** Editör: değişiklikler öneri olarak gider; izleyici: salt okunur */
  canProposeChanges: boolean;
  currentUid: string | undefined;
  userProfiles: Map<string, UserProfile>;
  onToggleStatus: () => void;
  onRefresh: () => void;
  displayName: (uid: string) => string;
  onProposeChange?: (stopId: string, payload: EditStopPayload) => Promise<void>;
  /** Harita / Places ile konum seçimi (enlem-boylam formu yerine) */
  onRelocateWithSearch?: () => void;
  /** Liste sırası (0 = başlangıç); özet satırında önceki duraktan mesafe/süre */
  stopIndex: number;
  /** Rota plan günü seçimi (YYYY-MM-DD aralığı) */
  tripStartDate?: string;
  tripEndDate?: string;
  /** Uzun basınca silme onayı (genelde rota admini) */
  onLongPressDelete?: () => void;
  /** Masraf türü yokken kullanıcıyı Profil → Masraf türleri’ne göndermek için */
  onOpenProfileForExpenseTypes?: () => void;
  /** Plan günü + konum için günlük hava özeti (Open-Meteo) */
  weatherPeekLine?: string;
  /** Hava satırına dokununca 16 günlük tahmin (konum varsa) */
  onWeatherPeekPress?: () => void;
};

type PeekLineAccent =
  | 'distance'
  | 'drive'
  | 'weather'
  | 'clock'
  | 'stay'
  | 'money'
  | 'pending'
  | 'hint'
  | 'default';

type PeekSummaryLine =
  | { kind: 'text'; text: string; accent?: PeekLineAccent }
  | { kind: 'rating'; valueText: string };

/** Kapalı kart özeti: her bilgi ayrı satır; metin yatayda serbest kırılır */
function buildPeekSummaryLines(
  stop: Stop,
  stopIndex: number,
  weatherPeekLine?: string
): PeekSummaryLine[] {
  const lines: PeekSummaryLine[] = [];
  const leg = stop.legFromPrevious;
  if (stopIndex > 0 && leg?.distanceKm != null) {
    const basisHint = leg.distanceBasis === 'straight_line' ? ' (kuş uçuşu)' : '';
    lines.push({
      kind: 'text',
      accent: 'distance',
      text: `↧ Önceki duraktan tahmini mesafe: ~${leg.distanceKm} km${basisHint}`,
    });
    if (leg.durationMin != null) {
      lines.push({
        kind: 'text',
        accent: 'drive',
        text: `⏱ Önceki duraktan tahmini yol süresi: ~${leg.durationMin} dk`,
      });
    }
  } else if (stopIndex > 0 && leg?.durationMin != null) {
    lines.push({
      kind: 'text',
      accent: 'drive',
      text: `⏱ Önceki duraktan tahmini yol süresi: ~${leg.durationMin} dk`,
    });
  }
  const wLine = weatherPeekLine?.trim();
  if (wLine) lines.push({ kind: 'text', accent: 'weather', text: wLine });
  const ratingParts = getGooglePlaceRatingParts(stop.placeRating, stop.placeUserRatingsTotal);
  if (ratingParts) lines.push({ kind: 'rating', valueText: ratingParts.valueText });
  if (stop.arrivalTime || stop.departureTime) {
    lines.push({
      kind: 'text',
      accent: 'clock',
      text: `🕐 ${stop.arrivalTime || '–'} – ${stop.departureTime || '–'}`,
    });
  }
  const stayMin = stayMinutesBetweenTimes(stop.arrivalTime, stop.departureTime);
  if (stayMin != null && stayMin > 0) {
    const dur = formatDrivingDurationMinutes(stayMin);
    if (dur) lines.push({ kind: 'text', accent: 'stay', text: `📍 Durakta kalış: ${dur}` });
  }
  const extraTotal = stopExtraTotal(stop);
  if (extraTotal > 0) lines.push({ kind: 'text', accent: 'money', text: `💰 ${extraTotal} TL` });
  if (stop.status === 'pending') {
    lines.push({ kind: 'text', accent: 'pending', text: '⏳ Onay bekliyor' });
  }
  return lines;
}

function parseTimeToMinutes(t: string): number | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function StopCard(props: Props) {
  const appTheme = useAppTheme();
  const { mode } = useThemeMode();
  const expensePursePalette = useMemo(() => {
    if (mode === 'dark') {
      return {
        shellBg: 'rgba(251, 191, 36, 0.16)',
        shellBorder: 'rgba(245, 158, 11, 0.5)',
        wallet: '#FBBF24',
        coinFill: '#FDE047',
        coinBorder: '#CA8A04',
        notifyDot: '#FACC15',
      };
    }
    return {
      shellBg: '#FEF9E8',
      shellBorder: 'rgba(180, 83, 9, 0.4)',
      wallet: '#92400E',
      coinFill: '#EAB308',
      coinBorder: '#A16207',
      notifyDot: '#CA8A04',
    };
  }, [mode]);
  const styles = useMemo(() => createStopCardStyles(appTheme), [appTheme]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [locationName, setLocationName] = useState(props.stop.locationName);
  const [arrivalTime, setArrivalTime] = useState(props.stop.arrivalTime ?? '');
  const [departureTime, setDepartureTime] = useState(props.stop.departureTime ?? '');
  const expensesSyncKey = useMemo(() => {
    const n = normalizeStopExtraExpenses(props.stop);
    return n.map((e) => `${e.expenseId}:${e.amount}:${e.extraExpenseTypeId ?? ''}`).join('|');
  }, [props.stop]);
  const [savingTime, setSavingTime] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [planDay, setPlanDay] = useState<Date | null>(() => {
    const fromStop = parseTripYmd(props.stop.stopDate);
    if (fromStop) return fromStop;
    return parseTripYmd(props.tripStartDate);
  });

  useEffect(() => {
    setLocationName(props.stop.locationName);
    setArrivalTime(props.stop.arrivalTime ?? '');
    setDepartureTime(props.stop.departureTime ?? '');
  }, [props.stop.locationName, props.stop.arrivalTime, props.stop.departureTime]);

  useEffect(() => {
    const fromStop = parseTripYmd(props.stop.stopDate);
    if (fromStop) {
      setPlanDay(fromStop);
      return;
    }
    setPlanDay(parseTripYmd(props.tripStartDate));
  }, [props.stop.stopDate, props.tripStartDate]);

  const stayMinutes = useMemo(() => {
    const a = parseTimeToMinutes(arrivalTime);
    const d = parseTimeToMinutes(departureTime);
    if (a == null || d == null) return null;
    let diff = d - a;
    if (diff < 0) diff += 24 * 60;
    return diff;
  }, [arrivalTime, departureTime]);

  async function handleSaveTimes() {
    if (props.canProposeChanges && props.onProposeChange && !props.isAdmin) {
      setProposing(true);
      try {
        await props.onProposeChange(props.stop.stopId, {
          arrivalTime: arrivalTime.trim() || undefined,
          departureTime: departureTime.trim() || undefined,
        });
        props.onRefresh();
      } finally {
        setProposing(false);
      }
      return;
    }
    if (!props.isAdmin) return;
    setSavingTime(true);
    try {
      await updateStopTimes(
        props.stop.stopId,
        {
          arrivalTime: arrivalTime.trim() || undefined,
          departureTime: departureTime.trim() || undefined,
        },
        props.currentUid
      );
      props.onRefresh();
    } finally {
      setSavingTime(false);
    }
  }

  async function handleSavePlanDay() {
    if (!planDay) return;
    const ymd = format(planDay, 'yyyy-MM-dd');
    if (props.canProposeChanges && props.onProposeChange && !props.isAdmin) {
      setProposing(true);
      try {
        await props.onProposeChange(props.stop.stopId, { stopDate: ymd });
        props.onRefresh();
      } finally {
        setProposing(false);
      }
      return;
    }
    if (!props.isAdmin) return;
    setSavingTime(true);
    try {
      const { updateStopFromPayload } = await import('../services/trips');
      await updateStopFromPayload(props.stop.stopId, { stopDate: ymd }, props.currentUid);
      props.onRefresh();
    } finally {
      setSavingTime(false);
    }
  }

  async function handleSaveName() {
    const name = locationName.trim();
    if (!name) return;
    if (props.isAdmin) {
      setSavingTime(true);
      try {
        const { updateStopFromPayload } = await import('../services/trips');
        await updateStopFromPayload(props.stop.stopId, { locationName: name }, props.currentUid);
        props.onRefresh();
      } finally {
        setSavingTime(false);
      }
      return;
    }
    if (props.canProposeChanges && props.onProposeChange) {
      setProposing(true);
      try {
        await props.onProposeChange(props.stop.stopId, { locationName: name });
        props.onRefresh();
      } finally {
        setProposing(false);
      }
    }
  }

  const showEditFields = props.isAdmin || props.canProposeChanges;
  const leg = props.stop.legFromPrevious;
  const peekLines = useMemo(
    () => buildPeekSummaryLines(props.stop, props.stopIndex, props.weatherPeekLine),
    [
      props.stopIndex,
      props.weatherPeekLine,
      props.stop.status,
      props.stop.arrivalTime,
      props.stop.departureTime,
      props.stop.cost,
      props.stop.extraExpenses,
      props.stop.legFromPrevious?.distanceKm,
      props.stop.legFromPrevious?.durationMin,
      props.stop.legFromPrevious?.distanceBasis,
      props.stop.placeRating,
      props.stop.placeUserRatingsTotal,
    ]
  );

  const peekAccentStyle = useMemo(
    () => ({
      distance: styles.peekAccentDistance,
      drive: styles.peekAccentDrive,
      weather: styles.peekAccentWeather,
      clock: styles.peekAccentClock,
      stay: styles.peekAccentStay,
      money: styles.peekAccentMoney,
      pending: styles.peekAccentPending,
      hint: styles.peekAccentHint,
      default: styles.peekAccentDefault,
    }),
    [styles]
  );

  const placeRatingParts = getGooglePlaceRatingParts(
    props.stop.placeRating,
    props.stop.placeUserRatingsTotal
  );

  const planDayRange = useMemo(() => {
    const a = parseTripYmd(props.tripStartDate);
    const b = parseTripYmd(props.tripEndDate ?? props.tripStartDate);
    if (!a || !b) return { min: undefined as Date | undefined, max: undefined as Date | undefined };
    return a.getTime() <= b.getTime() ? { min: a, max: b } : { min: b, max: a };
  }, [props.tripStartDate, props.tripEndDate]);

  const detailMaxHeight = useMemo(
    () => Math.min(420, Math.round(Dimensions.get('window').height * 0.52)),
    []
  );

  const normalizedExtras = useMemo(
    () => normalizeStopExtraExpenses(props.stop),
    [props.stop, expensesSyncKey]
  );
  const extraTotalDisplay = useMemo(
    () => Math.round(normalizedExtras.reduce((s, e) => s + e.amount, 0) * 100) / 100,
    [normalizedExtras]
  );

  const headerAccessibilityHint = props.onLongPressDelete
    ? 'Ayrıntı için dokun; silmek için uzun bas'
    : 'Ayrıntıları aç veya kapat';

  return (
    <View style={[styles.card, !detailsOpen ? styles.cardCollapsed : styles.cardOpen]}>
      <View style={styles.cardTopRow}>
        <Pressable
          onPress={() => setDetailsOpen((o) => !o)}
          onLongPress={props.onLongPressDelete}
          delayLongPress={480}
          style={({ pressed }) => [
            styles.headerTap,
            pressed && { opacity: 0.92 },
          ]}
          accessibilityRole="button"
          accessibilityState={{ expanded: detailsOpen }}
          accessibilityHint={headerAccessibilityHint}
        >
          {!detailsOpen ? (
            <View style={styles.collapsedTitleRow}>
              <View style={styles.stopIndexBadge}>
                <Text style={styles.stopIndexBadgeText}>{props.stopIndex + 1}</Text>
              </View>
              <View style={styles.headerTitleOnlyCol}>
                <Text style={styles.stopNameCollapsed} numberOfLines={1}>
                  {props.stop.locationName}
                </Text>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.stopIndexBadge}>
                <Text style={styles.stopIndexBadgeText}>{props.stopIndex + 1}</Text>
              </View>
              <View style={styles.headerTextCol}>
                <Text style={styles.stopName} numberOfLines={3}>
                  {props.stop.locationName}
                </Text>
              </View>
            </>
          )}
        </Pressable>
        <View style={styles.headerRightActions}>
          {showEditFields ? (
            <Pressable
              onPress={() => setExpenseModalOpen(true)}
              style={({ pressed }) => [styles.expenseIconBtn, pressed && { opacity: 0.88 }]}
              accessibilityRole="button"
              accessibilityLabel="Masrafları düzenle"
              hitSlop={10}
            >
              <View
                style={[
                  styles.expensePurse,
                  {
                    backgroundColor: expensePursePalette.shellBg,
                    borderColor: expensePursePalette.shellBorder,
                  },
                ]}
              >
                <Ionicons name="wallet" size={18} color={expensePursePalette.wallet} />
                <View
                  style={[
                    styles.expenseGoldCoin,
                    {
                      backgroundColor: expensePursePalette.coinFill,
                      borderColor: expensePursePalette.coinBorder,
                    },
                  ]}
                />
                {normalizedExtras.length > 0 ? (
                  <View
                    style={[
                      styles.expenseIconDot,
                      { backgroundColor: expensePursePalette.notifyDot, borderColor: appTheme.color.surface },
                    ]}
                  />
                ) : null}
              </View>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setDetailsOpen((o) => !o)}
            style={({ pressed }) => [styles.chevronBtn, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={detailsOpen ? 'Daralt' : 'Genişlet'}
            accessibilityState={{ expanded: detailsOpen }}
            hitSlop={12}
          >
            <Text style={styles.rowChevron}>{detailsOpen ? '▲' : '▼'}</Text>
          </Pressable>
          {props.isAdmin ? (
            <Pressable
              onPress={props.onToggleStatus}
              style={[
                styles.statusBtn,
                styles.statusBtnCompact,
                props.stop.status === 'approved' ? styles.statusApproved : null,
              ]}
            >
              <Text style={styles.statusBtnTextCompact}>
                {props.stop.status === 'approved' ? 'Onaylı' : 'Onayla'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {!detailsOpen ? (
        <Pressable
          onPress={() => setDetailsOpen(true)}
          onLongPress={props.onLongPressDelete}
          delayLongPress={480}
          style={({ pressed }) => [styles.peekFullWidthTap, pressed && { opacity: 0.92 }]}
          accessibilityRole="button"
          accessibilityState={{ expanded: false }}
          accessibilityHint={headerAccessibilityHint}
        >
          <View style={styles.peekSummary}>
            {peekLines.length > 0 ? (
              peekLines.map((item, i) =>
                item.kind === 'text' ? (
                  item.accent === 'weather' && props.onWeatherPeekPress ? (
                    <Pressable
                      key={i}
                      onPress={props.onWeatherPeekPress}
                      hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
                      accessibilityRole="button"
                      accessibilityLabel="16 günlük hava tahmini"
                    >
                      <Text
                        style={[styles.peekLine, peekAccentStyle[item.accent ?? 'default']]}
                      >
                        {item.text}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text
                      key={i}
                      style={[
                        styles.peekLine,
                        peekAccentStyle[item.accent ?? 'default'],
                      ]}
                    >
                      {item.text}
                    </Text>
                  )
                ) : (
                  <Text key={i} style={[styles.peekLine, styles.peekRatingRow]}>
                    <Text style={styles.ratingStar}>★</Text>
                    <Text style={styles.peekRatingValue}>{` ${item.valueText}`}</Text>
                  </Text>
                )
              )
            ) : (
              <Text style={[styles.peekLine, peekAccentStyle.hint]}>Dokunarak ayrıntı</Text>
            )}
          </View>
        </Pressable>
      ) : null}

      {detailsOpen ? (
        <ScrollView
          style={[styles.detailScroll, { maxHeight: detailMaxHeight }]}
          contentContainerStyle={styles.detailScrollContent}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        >
          <Text style={styles.stopMeta}>
            {props.stop.status === 'pending' ? 'Onay bekliyor' : 'Onaylandı'}
            {placeRatingParts ? (
              <>
                {' · '}
                <Text style={styles.ratingStar}>★</Text>
                <Text>{` ${placeRatingParts.valueText}`}</Text>
              </>
            ) : null}
            {(props.stop.arrivalTime || props.stop.departureTime) && (
              <> · {props.stop.arrivalTime || '–'} – {props.stop.departureTime || '–'}</>
            )}
            {normalizedExtras.length > 0
              ? ` · Masraflar: ${normalizedExtras.map(formatStopExtraExpenseLine).join(' · ')}`
              : null}
          </Text>
          {props.stopIndex > 0 && leg?.distanceKm != null && (
            <Text style={styles.legLine}>
              Önceki duraktan tahmini mesafe: ~{leg.distanceKm} km
              {leg.distanceBasis === 'straight_line' ? ' (kuş uçuşu tahmini, yol değil)' : ''}
            </Text>
          )}
          {props.stopIndex > 0 && leg?.distanceKm != null && leg?.durationMin != null && (
            <Text style={styles.legLine}>
              Önceki duraktan tahmini yol süresi: ~{leg.durationMin} dk
            </Text>
          )}
          {props.stopIndex > 0 &&
            (leg?.distanceKm === undefined || leg?.distanceKm === null) &&
            leg?.durationMin != null && (
            <Text style={styles.legLine}>
              Önceki duraktan tahmini yol süresi: ~{leg.durationMin} dk (mesafe verisi yok)
            </Text>
          )}
          {stayMinutes != null && (
            <Text style={styles.stayLine}>Bu durakta kalış: ~{stayMinutes} dk</Text>
          )}
          {props.weatherPeekLine?.trim() ? (
            props.onWeatherPeekPress ? (
              <Pressable onPress={props.onWeatherPeekPress} accessibilityRole="button">
                <Text style={styles.weatherLine}>{props.weatherPeekLine.trim()}</Text>
              </Pressable>
            ) : (
              <Text style={styles.weatherLine}>{props.weatherPeekLine.trim()}</Text>
            )
          ) : null}

          {showEditFields ? (
        <>
          {(props.canProposeChanges && !props.isAdmin) && (
            <Text style={styles.hint}>
              Değişiklikler rota sahibinin onayına gönderilir.
            </Text>
          )}
          {normalizedExtras.length > 0 ? (
            <View style={styles.savedCostBox}>
              <Text style={styles.savedCostLabel}>Kayıtlı ekstra masraflar</Text>
              <View style={styles.savedCostLinesWrap}>
                {normalizedExtras.map((e) => (
                  <Text key={e.expenseId} style={styles.savedCostLine}>
                    {formatStopExtraExpenseLine(e)}
                  </Text>
                ))}
              </View>
              {normalizedExtras.length > 1 ? (
                <View style={styles.savedCostTotalRow}>
                  <Text style={styles.savedCostTotalLabel}>Toplam</Text>
                  <Text style={styles.savedCostTotalValue}>{extraTotalDisplay} TL</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <TextField
            label="Durak adı"
            value={locationName}
            onChangeText={setLocationName}
          />
          {(props.isAdmin || props.canProposeChanges) && (
            <Pressable onPress={handleSaveName} style={styles.smallBtn} disabled={proposing}>
              <Text style={styles.smallBtnText}>
                {props.isAdmin ? 'Adı kaydet' : 'Ad değişikliğini öner'}
              </Text>
            </Pressable>
          )}

          {props.tripStartDate && (props.tripEndDate || props.tripStartDate) ? (
            <>
              <DatePickerField
                label="Plan günü"
                value={planDay}
                onChange={setPlanDay}
                minDate={planDayRange.min}
                maxDate={planDayRange.max}
              />
              <Pressable onPress={handleSavePlanDay} style={styles.smallBtn} disabled={proposing || !planDay}>
                <Text style={styles.smallBtnText}>
                  {props.isAdmin ? 'Günü kaydet' : 'Gün önerisi gönder'}
                </Text>
              </Pressable>
            </>
          ) : null}

          <View style={styles.timeRow}>
            <View style={styles.timeCol}>
              <TimePickerField
                label="Giriş saati"
                value={arrivalTime}
                onChange={setArrivalTime}
                allowClear
                hideLabel
                iconOnlyPlaceholder
              />
            </View>
            <View style={styles.timeCol}>
              <TimePickerField
                label="Çıkış saati"
                value={departureTime}
                onChange={setDepartureTime}
                allowClear
                hideLabel
                iconOnlyPlaceholder
              />
            </View>
          </View>
          <Pressable onPress={handleSaveTimes} style={styles.smallBtn} disabled={proposing}>
            <Text style={styles.smallBtnText}>
              {props.isAdmin ? 'Saati kaydet' : 'Saat önerisi gönder'}
            </Text>
          </Pressable>
          {savingTime && <Text style={styles.muted}>Kaydediliyor...</Text>}

          {props.onRelocateWithSearch ? (
            <View style={{ marginTop: appTheme.space.sm }}>
              <PrimaryButton
                title="Konum seç"
                variant="outline"
                size="compact"
                onPress={props.onRelocateWithSearch}
              />
            </View>
          ) : null}
          {proposing && <Text style={styles.muted}>Öneri gönderiliyor...</Text>}
        </>
      ) : (
        <>
          {normalizedExtras.length > 0 ? (
            <View style={styles.savedCostBox}>
              <Text style={styles.savedCostLabel}>Ekstra masraflar (salt okunur)</Text>
              <View style={styles.savedCostLinesWrap}>
                {normalizedExtras.map((e) => (
                  <Text key={e.expenseId} style={styles.savedCostLine}>
                    {formatStopExtraExpenseLine(e)}
                  </Text>
                ))}
              </View>
              {normalizedExtras.length > 1 ? (
                <View style={styles.savedCostTotalRow}>
                  <Text style={styles.savedCostTotalLabel}>Toplam</Text>
                  <Text style={styles.savedCostTotalValue}>{extraTotalDisplay} TL</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <Text style={styles.viewerHint}>
            Bu durağı görüntülüyorsun. Notlarını rota sayfasındaki «Yorumlar» bölümünden paylaşabilirsin.
          </Text>
        </>
      )}
        </ScrollView>
      ) : null}

      <StopExtraExpensesModal
        visible={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        stop={props.stop}
        expenseTypes={props.expenseTypes}
        isAdmin={props.isAdmin}
        canProposeChanges={props.canProposeChanges}
        currentUid={props.currentUid}
        onProposeChange={props.onProposeChange}
        onRefresh={props.onRefresh}
        onOpenProfileForExpenseTypes={props.onOpenProfileForExpenseTypes}
      />
    </View>
  );
}

function createStopCardStyles(t: AppTheme) {
  return StyleSheet.create({
    card: {
      backgroundColor: t.color.surface,
      borderWidth: 1,
      borderColor: t.color.cardBorderPrimary,
      borderRadius: t.radius.md,
      marginBottom: t.space.xs,
      overflow: 'hidden',
      ...t.shadowSoft,
    },
    cardCollapsed: {
      paddingVertical: 6,
      paddingHorizontal: 10,
    },
    cardOpen: {
      paddingVertical: t.space.sm,
      paddingHorizontal: t.space.sm,
    },
    detailScroll: {
      marginTop: 6,
    },
    detailScrollContent: {
      paddingBottom: t.space.md,
    },
    cardTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      paddingVertical: 2,
    },
    headerTap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      minWidth: 0,
    },
    /** Kapalı özet: Onaylı butonunun altı dahil kartın tam iç genişliği */
    peekFullWidthTap: {
      alignSelf: 'stretch',
      width: '100%',
      marginTop: 4,
      paddingBottom: 2,
    },
    collapsedTitleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      width: '100%',
    },
    headerTitleOnlyCol: {
      flex: 1,
      minWidth: 0,
    },
    stopIndexBadge: {
      minWidth: 26,
      height: 26,
      borderRadius: 8,
      backgroundColor: t.color.primarySoft,
      borderWidth: 1,
      borderColor: t.color.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    stopIndexBadgeText: {
      color: t.color.primaryDark,
      fontSize: t.font.tiny,
      fontWeight: '900',
    },
    headerRightActions: {
      flexDirection: 'column',
      alignItems: 'flex-end',
      justifyContent: 'flex-start',
      gap: 6,
      flexShrink: 0,
    },
    chevronBtn: {
      paddingVertical: 2,
      paddingHorizontal: 4,
      minWidth: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowChevron: {
      fontSize: 12,
      color: t.color.muted,
      fontWeight: '800',
      lineHeight: 16,
      textAlign: 'center',
    },
    headerTextCol: { flex: 1, minWidth: 0, alignSelf: 'stretch' },
    stopNameCollapsed: {
      color: t.color.text,
      fontSize: t.font.small,
      fontWeight: '800',
    },
    peekSummary: {
      gap: 6,
      alignSelf: 'stretch',
      width: '100%',
      marginTop: 2,
      paddingVertical: 10,
      paddingHorizontal: 11,
      borderRadius: t.radius.md,
      backgroundColor: t.color.primarySoft,
      borderWidth: 1,
      borderColor: t.color.cardBorderPrimary,
    },
    peekLine: {
      fontSize: t.font.small,
      fontWeight: '800',
      lineHeight: 21,
      alignSelf: 'stretch',
    },
    peekAccentDefault: {
      color: t.color.textSecondary,
    },
    peekAccentDistance: {
      color: t.color.ocean,
    },
    peekAccentDrive: {
      color: t.color.primaryDark,
    },
    peekAccentWeather: {
      color: t.color.primary,
    },
    peekAccentClock: {
      color: t.color.accentPurple,
    },
    peekAccentStay: {
      color: t.color.accentTeal,
    },
    peekAccentMoney: {
      color: t.color.accent,
    },
    peekAccentPending: {
      color: t.color.danger,
    },
    peekAccentHint: {
      color: t.color.textSecondary,
      fontWeight: '700',
    },
    peekRatingRow: {
      color: t.color.textSecondary,
    },
    peekRatingValue: {
      color: t.color.text,
      fontWeight: '900',
    },
    ratingStar: {
      color: GOOGLE_PLACE_RATING_STAR_COLOR,
      fontWeight: '800',
    },
    savedCostBox: {
      marginTop: t.space.sm,
      marginBottom: t.space.xs,
      paddingVertical: t.space.sm,
      paddingHorizontal: t.space.sm,
      borderRadius: t.radius.md,
      backgroundColor: t.color.primarySoft,
      borderWidth: 1,
      borderColor: t.color.primary,
    },
    savedCostLabel: {
      color: t.color.muted,
      fontSize: t.font.tiny,
      fontWeight: '800',
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    savedCostLinesWrap: {
      marginTop: 6,
      gap: 6,
    },
    savedCostLine: {
      color: t.color.text,
      fontSize: t.font.body,
      fontWeight: '700',
    },
    savedCostTotalRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: t.color.border,
    },
    savedCostTotalLabel: {
      color: t.color.muted,
      fontSize: t.font.small,
      fontWeight: '800',
    },
    savedCostTotalValue: {
      color: t.color.text,
      fontSize: t.font.h2,
      fontWeight: '900',
    },
    expenseIconBtn: {
      paddingVertical: 0,
      paddingHorizontal: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    expensePurse: {
      width: 36,
      height: 32,
      borderRadius: 11,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    expenseGoldCoin: {
      position: 'absolute',
      bottom: 5,
      right: 5,
      width: 9,
      height: 9,
      borderRadius: 5,
      borderWidth: 1.5,
    },
    expenseIconDot: {
      position: 'absolute',
      top: -1,
      right: -1,
      width: 8,
      height: 8,
      borderRadius: 4,
      borderWidth: 1.5,
    },
    collapsedSummary: {
      color: t.color.muted,
      fontSize: t.font.small,
      fontWeight: '600',
      marginTop: 6,
      lineHeight: 18,
    },
    viewerHint: {
      color: t.color.muted,
      fontSize: t.font.small,
      marginTop: t.space.sm,
      lineHeight: 20,
    },
    stopRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 12 },
    stopName: { color: t.color.text, fontSize: t.font.body, fontWeight: '700' },
    stopMeta: { color: t.color.muted, fontSize: t.font.small, marginTop: 2 },
    legLine: { color: t.color.muted, fontSize: t.font.small, marginTop: 4 },
    stayLine: { color: t.color.accentTeal, fontSize: t.font.small, marginTop: 2, fontWeight: '700' },
    weatherLine: {
      color: t.color.textSecondary,
      fontSize: t.font.small,
      marginTop: t.space.sm,
      lineHeight: 20,
      fontWeight: '700',
    },
    hint: { color: t.color.muted, fontSize: t.font.small, marginBottom: t.space.xs },
    statusBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: t.radius.pill,
      backgroundColor: t.color.inputBg,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    statusBtnCompact: {
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    statusApproved: { backgroundColor: t.color.primarySoft },
    statusBtnText: { color: t.color.text, fontSize: t.font.small, fontWeight: '700' },
    statusBtnTextCompact: { color: t.color.text, fontSize: t.font.tiny, fontWeight: '800' },
    timeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: t.space.sm,
      gap: t.space.sm,
    },
    timeCol: { flex: 1, minWidth: 0 },
    coordRow: { flexDirection: 'row', marginTop: t.space.sm },
    smallBtn: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 6, marginTop: 4 },
    smallBtnText: { color: t.color.primary, fontSize: t.font.tiny, fontWeight: '700' },
    muted: { color: t.color.muted, fontSize: t.font.small, marginTop: 4 },
  });
}
