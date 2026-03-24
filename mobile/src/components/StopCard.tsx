import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import { TextField } from './TextField';
import { TimePickerField } from './TimePickerField';
import { addComment, getCommentsForStop } from '../services/comments';
import { updateStopTimes } from '../services/trips';
import type { Comment } from '../types/comment';
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
  /** Editör: değişiklikler öneri olarak gider; izleyici: sadece yorum */
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
  /** Uzun basınca silme onayı (genelde rota admini) */
  onLongPressDelete?: () => void;
};

/** Kapalı kart: tek–iki satır, yükseklik dostu özet */
function compactPeekSubtitle(stop: Stop, stopIndex: number): string {
  const parts: string[] = [];
  const leg = stop.legFromPrevious;
  if (stopIndex > 0 && leg?.distanceKm != null) {
    const basisHint = leg.distanceBasis === 'straight_line' ? ' (kuş uçuşu)' : '';
    parts.push(
      `↧ ~${leg.distanceKm} km${basisHint}${leg.durationMin != null ? ` · ~${leg.durationMin} dk` : ''}`
    );
  } else if (stopIndex > 0 && leg?.durationMin != null) {
    parts.push(`↧ ~${leg.durationMin} dk`);
  }
  if (stop.arrivalTime || stop.departureTime) {
    parts.push(`🕐 ${stop.arrivalTime || '–'}–${stop.departureTime || '–'}`);
  }
  const extraTotal = stopExtraTotal(stop);
  if (extraTotal > 0) parts.push(`💰 ${extraTotal} TL`);
  if (stop.status === 'pending') parts.push('Onay bekliyor');
  if (parts.length > 0) return parts.join(' · ');
  return 'Dokunarak ayrıntı';
}

function formatCommentTime(t: any) {
  if (!t?.toMillis) return '';
  try {
    return new Date(t.toMillis()).toLocaleString('tr-TR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);
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

  useEffect(() => {
    setLocationName(props.stop.locationName);
    setArrivalTime(props.stop.arrivalTime ?? '');
    setDepartureTime(props.stop.departureTime ?? '');
  }, [props.stop.locationName, props.stop.arrivalTime, props.stop.departureTime]);

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

  const loadComments = useCallback(async () => {
    const list = await getCommentsForStop(props.stop.stopId);
    setComments(list);
    setCommentsLoaded(true);
  }, [props.stop.stopId]);

  const toggleExpand = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    if (next && !commentsLoaded) loadComments();
  }, [expanded, commentsLoaded, loadComments]);

  async function handleAddComment() {
    const msg = newComment.trim();
    if (!msg || !props.currentUid) return;
    setPostingComment(true);
    try {
      await addComment({ stopId: props.stop.stopId, userId: props.currentUid, message: msg });
      setNewComment('');
      await loadComments();
      props.onRefresh();
    } finally {
      setPostingComment(false);
    }
  }

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
    const built = buildStopExpensesFromDraftRows(expenseRows, props.stop, props.expenseTypes);
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
  const peekSubtitle = useMemo(
    () => compactPeekSubtitle(props.stop, props.stopIndex),
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
    ]
  );

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

  return (
    <View style={[styles.card, !detailsOpen ? styles.cardCollapsed : styles.cardOpen]}>
      <View style={styles.cardTopRow}>
        <Pressable
          onPress={() => setDetailsOpen((o) => !o)}
          onLongPress={props.onLongPressDelete}
          delayLongPress={480}
          style={({ pressed }) => [styles.headerTap, pressed && { opacity: 0.92 }]}
          accessibilityRole="button"
          accessibilityState={{ expanded: detailsOpen }}
          accessibilityHint={
            props.onLongPressDelete
              ? 'Ayrıntı için dokun; silmek için uzun bas'
              : 'Ayrıntıları aç veya kapat'
          }
        >
          <View style={styles.stopIndexBadge}>
            <Text style={styles.stopIndexBadgeText}>{props.stopIndex + 1}</Text>
          </View>
          <View style={styles.headerTextCol}>
            <Text style={detailsOpen ? styles.stopName : styles.stopNameCollapsed} numberOfLines={detailsOpen ? 3 : 1}>
              {props.stop.locationName}
            </Text>
            {!detailsOpen ? (
              <Text style={styles.peekSubtitle} numberOfLines={2}>
                {peekSubtitle}
              </Text>
            ) : null}
          </View>
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
            {(props.stop.arrivalTime || props.stop.departureTime) && (
              <> · {props.stop.arrivalTime || '–'} – {props.stop.departureTime || '–'}</>
            )}
            {normalizedExtras.length > 0
              ? ` · Masraflar: ${normalizedExtras.map(formatStopExtraExpenseLine).join(' · ')}`
              : null}
          </Text>
          {props.stopIndex > 0 && leg?.distanceKm != null && (
            <Text style={styles.legLine}>
              Önceki duraktan: ~{leg.distanceKm} km
              {leg.distanceBasis === 'straight_line' ? ' (kuş uçuşu tahmini, yol değil)' : ''}
              {leg.durationMin != null ? ` · ~${leg.durationMin} dk` : ''}
            </Text>
          )}
          {props.stopIndex > 0 &&
            (leg?.distanceKm === undefined || leg?.distanceKm === null) &&
            leg?.durationMin != null && (
            <Text style={styles.legLine}>Önceki duraktan: ~{leg.durationMin} dk (tahmini)</Text>
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
              <Text style={styles.savedCostHint}>
                Aşağıdan satır ekleyip düzenleyebilir, kaydedebilir veya tümünü silebilirsin.
              </Text>
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

          <View style={styles.timeRow}>
            <View style={styles.timeCol}>
              <TimePickerField
                label="Giriş saati"
                value={arrivalTime}
                onChange={setArrivalTime}
                allowClear
              />
            </View>
            <View style={styles.timeCol}>
              <TimePickerField
                label="Çıkış saati"
                value={departureTime}
                onChange={setDepartureTime}
                allowClear
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
          <Text style={styles.muted}>
            Her satırda tutar ve isteğe bağlı tür seç. Birden fazla masraf ekleyebilirsin; kayıtta hepsi
            saklanır.
          </Text>
          {props.expenseTypes.length === 0 ? (
            <Text style={[styles.muted, { marginTop: appTheme.space.xs }]}>
              Profil sayfasından masraf türü ekleyebilirsin; şimdilik tür seçmeden tutar kaydedebilirsin.
            </Text>
          ) : null}

          {expenseRows.length === 0 ? (
            <Text style={[styles.muted, { marginTop: appTheme.space.sm }]}>
              Henüz satır yok. «Masraf satırı ekle» ile başla.
            </Text>
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
                  <Text style={styles.rowRemoveBtnText}>🗑 Satırı sil</Text>
                </Pressable>
              </View>
              {row.typeId &&
              !props.expenseTypes.some((x) => x.id === row.typeId) &&
              props.stop.extraExpenseTypeName &&
              props.stop.extraExpenseTypeId === row.typeId ? (
                <Text style={styles.orphanTypeHint}>
                  Kayıtlı tür (profilde yok): {props.stop.extraExpenseTypeName}
                </Text>
              ) : null}
              {props.expenseTypes.length > 0 ? (
                <View style={styles.typeChips}>
                  <Pressable
                    onPress={() => updateExpenseRow(row.expenseId, { typeId: '' })}
                    style={[styles.typeChip, !row.typeId ? styles.typeChipOn : null]}
                  >
                    <Text style={[styles.typeChipText, !row.typeId ? styles.typeChipTextOn : null]}>
                      Tür yok
                    </Text>
                  </Pressable>
                  {props.expenseTypes.map((et) => (
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
            <PrimaryButton title="+ Masraf satırı ekle" variant="outline" onPress={addExpenseRow} />
          </View>

          <View style={styles.expenseActionColumn}>
            <PrimaryButton
              title={props.isAdmin ? '💾 Masrafları kaydet' : '📤 Masraf önerisi gönder'}
              onPress={handleSaveAllExpenses}
              disabled={proposing || savingCost}
              loading={savingCost || proposing}
            />
            {(normalizedExtras.length > 0 || expenseRows.length > 0) && (
              <>
                <View style={{ height: appTheme.space.sm }} />
                <PrimaryButton
                  title="🗑 Tüm masrafları sil"
                  variant="danger"
                  onPress={handleClearCost}
                  disabled={proposing || savingCost}
                />
              </>
            )}
          </View>

          {props.onRelocateWithSearch ? (
            <View style={{ marginTop: appTheme.space.sm }}>
              <PrimaryButton
                title="📍 Konumu haritadan / arama ile seç"
                variant="outline"
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
          <Text style={styles.viewerHint}>Bu durağı görüntülüyorsun. Yorum ekleyebilirsin.</Text>
        </>
      )}

          <Pressable onPress={toggleExpand} style={styles.commentToggle}>
            <Text style={styles.commentToggleText}>
              Yorumlar ({comments.length}) {expanded ? '▼' : '▶'}
            </Text>
          </Pressable>
          {expanded ? (
            <View style={styles.commentBox}>
              {comments.map((c) => (
                <View key={c.commentId} style={styles.commentRow}>
                  <Text style={styles.commentAuthor}>{props.displayName(c.userId)}</Text>
                  <Text style={styles.commentTime}>{formatCommentTime(c.timestamp)}</Text>
                  <Text style={styles.commentMessage}>{c.message}</Text>
                </View>
              ))}
              <View style={{ height: appTheme.space.sm }} />
              <TextField
                label=""
                value={newComment}
                placeholder="Yorum yaz..."
                onChangeText={setNewComment}
              />
              <PrimaryButton
                title="Gönder"
                onPress={handleAddComment}
                loading={postingComment}
                disabled={!newComment.trim()}
              />
            </View>
          ) : null}
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
      alignItems: 'center',
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
    rowChevron: {
      fontSize: 11,
      color: t.color.muted,
      fontWeight: '800',
      marginTop: 6,
      width: 16,
    },
    headerTextCol: { flex: 1, minWidth: 0 },
    stopNameCollapsed: {
      color: t.color.text,
      fontSize: t.font.small,
      fontWeight: '800',
    },
    peekSubtitle: {
      color: t.color.muted,
      fontSize: t.font.tiny,
      fontWeight: '600',
      marginTop: 3,
      lineHeight: 16,
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
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: t.radius.pill,
      borderWidth: 2,
      borderColor: t.color.danger,
      backgroundColor: t.color.surface,
      ...t.shadowSoft,
    },
    rowRemoveBtnPressed: { backgroundColor: 'rgba(239, 68, 68, 0.12)' },
    rowRemoveBtnText: { color: t.color.danger, fontSize: t.font.small, fontWeight: '800' },
    savedCostHint: {
      color: t.color.muted,
      fontSize: t.font.small,
      marginTop: 8,
      lineHeight: 18,
    },
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
      alignSelf: 'flex-start',
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
    smallBtn: { alignSelf: 'flex-start', paddingVertical: 6, paddingRight: 8, marginTop: 4 },
    smallBtnText: { color: t.color.primary, fontSize: t.font.small, fontWeight: '700' },
    muted: { color: t.color.muted, fontSize: t.font.small, marginTop: 4 },
    commentToggle: { marginTop: t.space.sm, paddingVertical: 6 },
    commentToggleText: { color: t.color.primary, fontSize: t.font.small, fontWeight: '700' },
    commentBox: { marginTop: t.space.xs, paddingTop: t.space.sm, borderTopWidth: 1, borderTopColor: t.color.subtle },
    commentRow: { marginBottom: t.space.sm },
    commentAuthor: { color: t.color.text, fontSize: t.font.small, fontWeight: '700' },
    commentTime: { color: t.color.muted, fontSize: 12, marginTop: 2 },
    commentMessage: { color: t.color.text, fontSize: t.font.body, marginTop: 4 },
    typeLabel: {
      color: t.color.textSecondary,
      fontSize: t.font.small,
      fontWeight: '700',
      marginTop: t.space.sm,
    },
    typeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    typeChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
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
    typeChipText: { color: t.color.text, fontSize: t.font.small, fontWeight: '600' },
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
