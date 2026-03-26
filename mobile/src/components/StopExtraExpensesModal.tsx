import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';
import { PrimaryButton } from './PrimaryButton';
import { TextField } from './TextField';
import type { Stop, StopExtraExpense } from '../types/trip';
import type { EditStopPayload } from '../types/tripProposal';
import type { ExpenseType } from '../services/userProfile';
import {
  materializeExpenseIds,
  newExpenseId,
  normalizeStopExtraExpenses,
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

export type StopExtraExpensesModalProps = {
  visible: boolean;
  onClose: () => void;
  stop: Stop;
  expenseTypes: ExpenseType[];
  isAdmin: boolean;
  canProposeChanges: boolean;
  currentUid: string | undefined;
  onProposeChange?: (stopId: string, payload: EditStopPayload) => Promise<void>;
  onRefresh: () => void;
  onOpenProfileForExpenseTypes?: () => void;
};

export function StopExtraExpensesModal(props: StopExtraExpensesModalProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const expenseTypesList = Array.isArray(props.expenseTypes) ? props.expenseTypes : [];

  const expensesSyncKey = useMemo(() => {
    const n = normalizeStopExtraExpenses(props.stop);
    return n.map((e) => `${e.expenseId}:${e.amount}:${e.extraExpenseTypeId ?? ''}`).join('|');
  }, [props.stop]);

  const [expenseRows, setExpenseRows] = useState<ExpenseDraftRow[]>([]);
  const [savingCost, setSavingCost] = useState(false);
  const [proposing, setProposing] = useState(false);

  useEffect(() => {
    if (!props.visible) return;
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
  }, [props.visible, props.stop.stopId, expensesSyncKey]);

  function addExpenseRow() {
    setExpenseRows((prev) => [...prev, { expenseId: newExpenseId(), amountInput: '', typeId: '' }]);
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
        props.onClose();
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
      props.onClose();
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
        props.onClose();
      } finally {
        setProposing(false);
      }
      return;
    }
    if (!props.isAdmin) return;
    setSavingCost(true);
    try {
      const { updateStopExtraExpenses } = await import('../services/trips');
      await updateStopExtraExpenses(props.stop.stopId, built, props.currentUid);
      props.onRefresh();
      props.onClose();
    } finally {
      setSavingCost(false);
    }
  }

  const maxBodyH = Math.min(winH * 0.72, 520);

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
      onRequestClose={props.onClose}
    >
      <Pressable style={styles.backdrop} onPress={props.onClose}>
        <Pressable style={[styles.sheet, { marginTop: insets.top + 12, maxHeight: winH - insets.top - 24 }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetTitleCol}>
              <Text style={styles.sheetKicker}>Ekstra masraflar</Text>
              <Text style={styles.sheetTitle} numberOfLines={2}>
                {props.stop.locationName}
              </Text>
            </View>
            <Pressable
              onPress={props.onClose}
              hitSlop={14}
              accessibilityRole="button"
              accessibilityLabel="Kapat"
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="close" size={26} color={theme.color.muted} />
            </Pressable>
          </View>

          {(props.canProposeChanges && !props.isAdmin) && (
            <Text style={styles.hint}>Değişiklikler rota sahibinin onayına gönderilir.</Text>
          )}

          <ScrollView
            style={{ maxHeight: maxBodyH }}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {expenseTypesList.length === 0 ? (
              <View style={styles.expenseTypesEmptyBox}>
                <Text style={styles.expenseTypesEmptyText}>
                  Profilinde henüz masraf türü tanımlı değil. Tutarı yine de girebilirsin (tür isteğe bağlı).
                  Tür seçenekleri için önce profilinden en az bir masraf çeşidi ekle.
                </Text>
                {props.onOpenProfileForExpenseTypes ? (
                  <Pressable
                    onPress={() => {
                      props.onOpenProfileForExpenseTypes?.();
                      props.onClose();
                    }}
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

            <View style={{ marginTop: theme.space.sm }}>
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
                onPress={() => void handleSaveAllExpenses()}
                disabled={proposing || savingCost}
                loading={savingCost || proposing}
              />
              {(normalizeStopExtraExpenses(props.stop).length > 0 || expenseRows.length > 0) && (
                <>
                  <View style={{ height: theme.space.xs }} />
                  <PrimaryButton
                    title="Tümünü sil"
                    variant="danger"
                    size="compact"
                    onPress={() => void handleClearCost()}
                    disabled={proposing || savingCost}
                  />
                </>
              )}
            </View>
            {proposing && <Text style={styles.muted}>Öneri gönderiliyor...</Text>}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: theme.color.overlayDark,
      justifyContent: 'flex-start',
      alignItems: 'center',
      paddingHorizontal: theme.space.md,
    },
    sheet: {
      width: '100%',
      maxWidth: 440,
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.xl,
      borderWidth: 1,
      borderColor: theme.color.cardBorderPrimary,
      padding: theme.space.md,
      ...theme.shadowCard,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: theme.space.sm,
      marginBottom: theme.space.sm,
    },
    sheetTitleCol: { flex: 1, minWidth: 0 },
    sheetKicker: {
      color: theme.color.muted,
      fontSize: theme.font.tiny,
      fontWeight: '800',
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    sheetTitle: {
      color: theme.color.text,
      fontSize: theme.font.body,
      fontWeight: '900',
    },
    closeBtn: { padding: 4 },
    hint: { color: theme.color.muted, fontSize: theme.font.small, marginBottom: theme.space.sm },
    scrollContent: { paddingBottom: theme.space.lg },
    muted: { color: theme.color.muted, fontSize: theme.font.small, marginTop: theme.space.xs },
    expenseTypesEmptyBox: {
      marginBottom: theme.space.md,
      padding: theme.space.md,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.primary,
      backgroundColor: theme.color.primarySoft,
    },
    expenseTypesEmptyText: {
      color: theme.color.text,
      fontSize: theme.font.small,
      lineHeight: 20,
      fontWeight: '600',
    },
    expenseTypesProfileBtn: {
      alignSelf: 'flex-start',
      marginTop: theme.space.sm,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.primary,
    },
    expenseTypesProfileBtnText: {
      color: theme.color.primaryDark,
      fontSize: theme.font.small,
      fontWeight: '800',
    },
    expenseRow: {
      marginTop: theme.space.md,
      padding: theme.space.sm,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.inputBg,
    },
    expenseRowHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.space.sm,
      marginBottom: theme.space.xs,
    },
    expenseRowTitleWrap: { flex: 1, minWidth: 0 },
    expenseRowTitle: {
      color: theme.color.textSecondary,
      fontSize: theme.font.small,
      fontWeight: '800',
    },
    rowRemoveBtn: {
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: theme.radius.pill,
      borderWidth: 1.5,
      borderColor: theme.color.danger,
      backgroundColor: theme.color.surface,
      ...theme.shadowSoft,
    },
    rowRemoveBtnPressed: { backgroundColor: 'rgba(239, 68, 68, 0.12)' },
    rowRemoveBtnText: { color: theme.color.danger, fontSize: theme.font.tiny, fontWeight: '800' },
    typeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    typeChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.inputBg,
      maxWidth: '100%',
    },
    typeChipOn: {
      borderColor: theme.color.primary,
      backgroundColor: theme.color.primarySoft,
    },
    typeChipText: { color: theme.color.text, fontSize: theme.font.tiny, fontWeight: '600' },
    typeChipTextOn: { color: theme.color.primaryDark, fontWeight: '800' },
    orphanTypeHint: {
      color: theme.color.textSecondary,
      fontSize: theme.font.small,
      fontWeight: '600',
      marginTop: 6,
      fontStyle: 'italic',
    },
    expenseActionColumn: {
      marginTop: theme.space.md,
      alignSelf: 'stretch',
      width: '100%',
    },
  });
}
