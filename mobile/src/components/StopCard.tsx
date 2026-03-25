import { format } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DatePickerField } from './DatePickerField';
import { PrimaryButton } from './PrimaryButton';
import { TextField } from './TextField';
import { TimePickerField } from './TimePickerField';
import { formatGooglePlaceRatingLine } from '../services/places';
import { updateStopTimes } from '../services/trips';
import type { Stop, StopExtraExpense } from '../types/trip';
import type { EditStopPayload } from '../types/tripProposal';
import type { ExpenseType, UserProfile } from '../services/userProfile';
import {
  formatStopExtraExpenseLine,
  materializeExpenseIds,
  newExpenseId,
  normalizeStopExtraExpenses,
  stopExtraTotal,
} from '../utils/stopExpenses';
import { stayMinutesBetweenTimes } from '../utils/planTime';
import { formatDrivingDurationMinutes, parseTripYmd } from '../utils/tripSchedule';

type ExpenseDraftRow = {
  expenseId: string;
  amountInput: string;
  typeId: string;
};

function buildStopExpensesFromDraftRows(
  rows: ExpenseDraftRow[],
  stop: Stop,
  expenseTypes: ExpenseType[]
): StopExtraExpense[] {
  const rawList: StopExtraExpense[] = [];
  for (const r of rows) {
    const raw = r.amountInput.trim();
    if (raw === '') continue;
    const amount = parseFloat(raw.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) continue;
    const selected = expenseTypes.find((x) => x.id === r.typeId);
    let typeId: string | null = selected ? selected.id : null;
    let typeName: string | null = selected ? selected.name : null;
    if (!selected && r.typeId && stop.extraExpenseTypeId === r.typeId && stop.extraExpenseTypeName) {
      typeId = stop.extraExpenseTypeId;
      typeName = stop.extraExpenseTypeName;
    }
    rawList.push({
      expenseId: r.expenseId,
      amount: Math.round(amount * 100) / 100,
      extraExpenseTypeId: typeId,
      extraExpenseTypeName: typeName,
    });
  }
  return materializeExpenseIds(rawList);
}

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
};

/** Kapalı kart özeti: her bilgi ayrı satır; metin yatayda serbest kırılır */
function buildPeekSummaryLines(stop: Stop, stopIndex: number): string[] {
  const lines: string[] = [];
  const leg = stop.legFromPrevious;
  if (stopIndex > 0 && leg?.distanceKm != null) {
    const basisHint = leg.distanceBasis === 'straight_line' ? ' (kuş uçuşu)' : '';
    lines.push(`↧ Önceki duraktan tahmini mesafe: ~${leg.distanceKm} km${basisHint}`);
    if (leg.durationMin != null) {
      lines.push(
        `⏱ Önceki duraktan tahmini yol süresi: ~${leg.durationMin} dk`
      );
    }
  } else if (stopIndex > 0 && leg?.durationMin != null) {
    lines.push(`⏱ Önceki duraktan tahmini yol süresi: ~${leg.durationMin} dk`);
  }
  const ratingLine = formatGooglePlaceRatingLine(stop.placeRating, stop.placeUserRatingsTotal);
  if (ratingLine) lines.push(ratingLine);
  if (stop.arrivalTime || stop.departureTime) {
    lines.push(`🕐 ${stop.arrivalTime || '–'} – ${stop.departureTime || '–'}`);
  }
  const stayMin = stayMinutesBetweenTimes(stop.arrivalTime, stop.departureTime);
  if (stayMin != null && stayMin > 0) {
    const dur = formatDrivingDurationMinutes(stayMin);
    if (dur) lines.push(`📍 Durakta kalış: ${dur}`);
  }
  const extraTotal = stopExtraTotal(stop);
  if (extraTotal > 0) lines.push(`💰 ${extraTotal} TL`);
  if (stop.status === 'pending') lines.push('Onay bekliyor');
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
  const styles = useMemo(() => createStopCardStyles(appTheme), [appTheme]);
  const expenseTypesList = Array.isArray(props.expenseTypes) ? props.expenseTypes : [];
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [locationName, setLocationName] = useState(props.stop.locationName);
  const [arrivalTime, setArrivalTime] = useState(props.stop.arrivalTime ?? '');
  const [departureTime, setDepartureTime] = useState(props.stop.departureTime ?? '');
  const expensesSyncKey = useMemo(() => {
    const n = normalizeStopExtraExpenses(props.stop);
    return n.map((e) => `${e.expenseId}:${e.amount}:${e.extraExpenseTypeId ?? ''}`).join('|');
  }, [props.stop]);
  const [expenseRows, setExpenseRows] = useState<ExpenseDraftRow[]>(() => {
    const n = normalizeStopExtraExpenses(props.stop);
    return n.length > 0
      ? n.map((e) => ({
          expenseId: e.expenseId,
          amountInput: String(e.amount),
          typeId: e.extraExpenseTypeId ?? '',
        }))
      : [];
  });
  const [savingTime, setSavingTime] = useState(false);
  const [savingCost, setSavingCost] = useState(false);
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

  useEffect(() => {
    const norm = normalizeStopExtraExpenses(props.stop);
    setExpenseRows(
      norm.length > 0
        ? norm.map((e) => ({
            expenseId: e.expenseId,
            amountInput: String(e.amount),
            typeId: e.extraExpenseTypeId ?? '',
          }))
        : []
    );
  }, [props.stop.stopId, expensesSyncKey]);

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
      await updateStopTimes(props.stop.stopId, {
        arrivalTime: arrivalTime.trim() || undefined,
        departureTime: departureTime.trim() || undefined,
      });
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
      await updateStopFromPayload(props.stop.stopId, { stopDate: ymd });
      props.onRefresh();
    } finally {
      setSavingTime(false);
    }
  }

  function addExpenseRow() {
    setExpenseRows((prev) => [
      ...prev,
      { expenseId: newExpenseId(), amountInput: '', typeId: '' },
    ]);
  }

  function removeExpenseRow(expenseId: string) {
    setExpenseRows((prev) => prev.filter((r) => r.expenseId !== expenseId));
  }

  function updateExpenseRow(expenseId: string, patch: Partial<ExpenseDraftRow>) {
    setExpenseRows((prev) =>
      prev.map((r) => (r.expenseId === expenseId ? { ...r, ...patch } : r))
    );
  }

  async function handleClearCost() {
    if (!props.isAdmin && !(props.canProposeChanges && props.onProposeChange)) return;
    setExpenseRows([]);
    if (props.canProposeChanges && props.onProposeChange && !props.isAdmin) {
      setProposing(true);
      try {
        await props.onProposeChange(props.stop.stopId, { extraExpenses: [] });
        props.onRefresh();
      } finally {
        setProposing(false);
      }
      return;
    }
    if (!props.isAdmin) return;
    setSavingCost(true);
    try {
      const { updateStopExtraExpenses } = await import('../services/trips');
      await updateStopExtraExpenses(props.stop.stopId, []);
      props.onRefresh();
    } finally {
      setSavingCost(false);
    }
  }

  async function handleSaveAllExpenses() {
    const built = buildStopExpensesFromDraftRows(expenseRows, props.stop, expenseTypesList);
    if (props.canProposeChanges && props.onProposeChange && !props.isAdmin) {
      setProposing(true);
      try {
        await props.onProposeChange(props.stop.stopId, { extraExpenses: built });
        props.onRefresh();
      } finally {
        setProposing(false);
      }
      return;
    }
    if (!props.isAdmin) return;
    setSavingCost(true);
    try {
      const { updateStopExtraExpenses } = await import('../services/trips');
      await updateStopExtraExpenses(props.stop.stopId, built);
      props.onRefresh();
    } finally {
      setSavingCost(false);
    }
  }

  async function handleSaveName() {
    const name = locationName.trim();
    if (!name) return;
    if (props.isAdmin) {
      setSavingTime(true);
      try {
        const { updateStopFromPayload } = await import('../services/trips');
        await updateStopFromPayload(props.stop.stopId, { locationName: name });
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
    () => buildPeekSummaryLines(props.stop, props.stopIndex),
    [
      props.stopIndex,
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

  const placeRatingLine = formatGooglePlaceRatingLine(
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
              peekLines.map((line, i) => (
                <Text key={i} style={styles.peekLine}>
                  {line}
                </Text>
              ))
            ) : (
              <Text style={styles.peekLine}>Dokunarak ayrıntı</Text>
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
          showsVerticalScrollIndicator
        >
          <Text style={styles.stopMeta}>
            {props.stop.status === 'pending' ? 'Onay bekliyor' : 'Onaylandı'}
            {placeRatingLine ? <> · {placeRatingLine}</> : null}
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

          <Text style={styles.typeLabel}>Ekstra masraflar</Text>

          {showEditFields && expenseTypesList.length === 0 ? (
            <View style={styles.expenseTypesEmptyBox}>
              <Text style={styles.expenseTypesEmptyText}>
                Profilinde henüz masraf türü tanımlı değil. Tutarı yine de girebilirsin (tür isteğe bağlı).
                Tür seçenekleri için önce profilinden en az bir masraf çeşidi ekle.
              </Text>
              {props.onOpenProfileForExpenseTypes ? (
                <Pressable
                  onPress={props.onOpenProfileForExpenseTypes}
                  style={({ pressed }) => [
                    styles.expenseTypesProfileBtn,
                    pressed ? { opacity: 0.88 } : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Profil ekranına git, masraf türü ekle"
                >
                  <Text style={styles.expenseTypesProfileBtnText}>Profil → Masraf türleri ›</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {expenseRows.map((row, idx) => (
            <View key={row.expenseId} style={styles.expenseRow}>
              <View style={styles.expenseRowHeader}>
                <View style={styles.expenseRowTitleWrap}>
                  <Text style={styles.expenseRowTitle}>Masraf {idx + 1}</Text>
                </View>
                <Pressable
                  onPress={() => removeExpenseRow(row.expenseId)}
                  style={({ pressed }) => [
                    styles.rowRemoveBtn,
                    pressed ? styles.rowRemoveBtnPressed : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Bu masraf satırını sil"
                >
                  <Text style={styles.rowRemoveBtnText}>Sil</Text>
                </Pressable>
              </View>
              {row.typeId &&
              !expenseTypesList.some((x) => x.id === row.typeId) &&
              props.stop.extraExpenseTypeName &&
              props.stop.extraExpenseTypeId === row.typeId ? (
                <Text style={styles.orphanTypeHint}>
                  Kayıtlı tür (profilde yok): {props.stop.extraExpenseTypeName}
                </Text>
              ) : null}
              {expenseTypesList.length > 0 ? (
                <View style={styles.typeChips}>
                  <Pressable
                    onPress={() => updateExpenseRow(row.expenseId, { typeId: '' })}
                    style={[styles.typeChip, !row.typeId ? styles.typeChipOn : null]}
                  >
                    <Text style={[styles.typeChipText, !row.typeId ? styles.typeChipTextOn : null]}>
                      Tür yok
                    </Text>
                  </Pressable>
                  {expenseTypesList.map((et) => (
                    <Pressable
                      key={et.id}
                      onPress={() => updateExpenseRow(row.expenseId, { typeId: et.id })}
                      style={[styles.typeChip, row.typeId === et.id ? styles.typeChipOn : null]}
                    >
                      <Text
                        style={[
                          styles.typeChipText,
                          row.typeId === et.id ? styles.typeChipTextOn : null,
                        ]}
                        numberOfLines={1}
                      >
                        {et.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <TextField
                label="Tutar (TL)"
                value={row.amountInput}
                placeholder="0"
                keyboardType="number-pad"
                onChangeText={(t) => updateExpenseRow(row.expenseId, { amountInput: t })}
              />
            </View>
          ))}

          <View style={{ marginTop: appTheme.space.sm }}>
            <PrimaryButton
              title="+ Satır ekle"
              variant="outline"
              size="compact"
              onPress={addExpenseRow}
            />
          </View>

          <View style={styles.expenseActionColumn}>
            <PrimaryButton
              title={props.isAdmin ? 'Kaydet' : 'Öneri gönder'}
              size="compact"
              onPress={handleSaveAllExpenses}
              disabled={proposing || savingCost}
              loading={savingCost || proposing}
            />
            {(normalizedExtras.length > 0 || expenseRows.length > 0) && (
              <>
                <View style={{ height: appTheme.space.xs }} />
                <PrimaryButton
                  title="Tümünü sil"
                  variant="danger"
                  size="compact"
                  onPress={handleClearCost}
                  disabled={proposing || savingCost}
                />
              </>
            )}
          </View>

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
      gap: 4,
      alignSelf: 'stretch',
      width: '100%',
    },
    peekLine: {
      color: t.color.muted,
      fontSize: t.font.tiny,
      fontWeight: '600',
      lineHeight: 18,
      alignSelf: 'stretch',
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
    expenseRow: {
      marginTop: t.space.md,
      padding: t.space.sm,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderColor: t.color.border,
      backgroundColor: t.color.inputBg,
    },
    expenseRowHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.sm,
      marginBottom: t.space.xs,
    },
    expenseRowTitleWrap: { flex: 1, minWidth: 0 },
    expenseRowTitle: {
      color: t.color.textSecondary,
      fontSize: t.font.small,
      fontWeight: '800',
    },
    rowRemoveBtn: {
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: t.radius.pill,
      borderWidth: 1.5,
      borderColor: t.color.danger,
      backgroundColor: t.color.surface,
      ...t.shadowSoft,
    },
    rowRemoveBtnPressed: { backgroundColor: 'rgba(239, 68, 68, 0.12)' },
    rowRemoveBtnText: { color: t.color.danger, fontSize: t.font.tiny, fontWeight: '800' },
    expenseActionColumn: {
      marginTop: t.space.md,
      alignSelf: 'stretch',
      width: '100%',
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
    typeLabel: {
      color: t.color.textSecondary,
      fontSize: t.font.small,
      fontWeight: '700',
      marginTop: t.space.sm,
    },
    expenseTypesEmptyBox: {
      marginTop: t.space.sm,
      padding: t.space.md,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderColor: t.color.primary,
      backgroundColor: t.color.primarySoft,
    },
    expenseTypesEmptyText: {
      color: t.color.text,
      fontSize: t.font.small,
      lineHeight: 20,
      fontWeight: '600',
    },
    expenseTypesProfileBtn: {
      alignSelf: 'flex-start',
      marginTop: t.space.sm,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: t.radius.pill,
      backgroundColor: t.color.surface,
      borderWidth: 1,
      borderColor: t.color.primary,
    },
    expenseTypesProfileBtnText: {
      color: t.color.primaryDark,
      fontSize: t.font.small,
      fontWeight: '800',
    },
    typeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    typeChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: t.radius.pill,
      borderWidth: 1,
      borderColor: t.color.border,
      backgroundColor: t.color.inputBg,
      maxWidth: '100%',
    },
    typeChipOn: {
      borderColor: t.color.primary,
      backgroundColor: t.color.primarySoft,
    },
    typeChipText: { color: t.color.text, fontSize: t.font.tiny, fontWeight: '600' },
    typeChipTextOn: { color: t.color.primaryDark, fontWeight: '800' },
    orphanTypeHint: {
      color: t.color.textSecondary,
      fontSize: t.font.small,
      fontWeight: '600',
      marginTop: 6,
      fontStyle: 'italic',
    },
  });
}
