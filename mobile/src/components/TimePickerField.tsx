import DateTimePicker from '@react-native-community/datetimepicker';
import { createElement, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';
import { dateToPlanTime, normalizePlanTime, planTimeToDate } from '../utils/planTime';

type Props = {
  label: string;
  /** "HH:mm" veya boş */
  value: string;
  onChange: (hhmm: string) => void;
  helperText?: string;
  errorText?: string;
  /** Boş değere dönmeye izin ver (opsiyonel plan saatleri için) */
  allowClear?: boolean;
};

const isWeb = Platform.OS === 'web';

export function TimePickerField(props: Props) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [androidOpen, setAndroidOpen] = useState(false);
  const [iosOpen, setIosOpen] = useState(false);
  const [iosTemp, setIosTemp] = useState(() => planTimeToDate(props.value));

  useEffect(() => {
    if (!iosOpen) setIosTemp(planTimeToDate(props.value));
  }, [props.value, iosOpen]);

  const display = useMemo(() => {
    const n = normalizePlanTime(props.value);
    return n ?? '';
  }, [props.value]);

  const showClear = Boolean(props.allowClear && display);

  function openPicker() {
    if (isWeb) return;
    setIosTemp(planTimeToDate(props.value));
    if (Platform.OS === 'ios') setIosOpen(true);
    else setAndroidOpen(true);
  }

  if (isWeb) {
    return (
      <View style={styles.wrap}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>{props.label}</Text>
          {showClear ? (
            <Pressable onPress={() => props.onChange('')} hitSlop={8}>
              <Text style={styles.clearText}>Temizle</Text>
            </Pressable>
          ) : null}
        </View>
        <View
          style={[
            styles.input,
            theme.shadowSoft,
            props.errorText ? styles.inputError : null,
          ]}
        >
          {createElement('input', {
            type: 'time',
            value: display,
            onChange: (e: { target: { value: string } }) => {
              const v = e.target.value;
              if (!v) {
                props.onChange('');
                return;
              }
              const n = normalizePlanTime(v);
              props.onChange(n ?? v);
            },
            style: {
              border: 'none',
              background: 'transparent',
              fontSize: 16,
              fontWeight: 600,
              color: theme.color.text,
              width: '100%',
              outline: 'none',
              padding: 0,
              margin: 0,
              fontFamily: 'system-ui, sans-serif',
            },
          })}
        </View>
        {props.errorText ? <Text style={styles.error}>{props.errorText}</Text> : null}
        {!props.errorText && props.helperText ? (
          <Text style={styles.helper}>{props.helperText}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{props.label}</Text>
        {showClear ? (
          <Pressable onPress={() => props.onChange('')} hitSlop={8}>
            <Text style={styles.clearText}>Temizle</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable
        onPress={openPicker}
        style={({ pressed }) => [
          styles.input,
          theme.shadowSoft,
          pressed ? { opacity: 0.95 } : null,
          props.errorText ? styles.inputError : null,
        ]}
      >
        <Text style={[styles.value, !display ? styles.placeholder : null]}>
          {display || 'Saat seç'}
        </Text>
        <Text style={styles.chevron}>🕐</Text>
      </Pressable>

      {Platform.OS === 'android' && androidOpen ? (
        <DateTimePicker
          value={planTimeToDate(props.value)}
          mode="time"
          is24Hour
          display="default"
          onChange={(ev, date) => {
            setAndroidOpen(false);
            if (ev.type === 'dismissed') return;
            if (date) props.onChange(dateToPlanTime(date));
          }}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal visible={iosOpen} transparent animationType="fade">
          <Pressable style={styles.modalBackdrop} onPress={() => setIosOpen(false)}>
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>Saat seç</Text>
              <DateTimePicker
                value={iosTemp}
                mode="time"
                is24Hour
                display="spinner"
                onChange={(_, date) => {
                  if (date) setIosTemp(date);
                }}
                style={styles.iosPicker}
              />
              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setIosOpen(false)}
                  style={[styles.modalBtn, styles.modalBtnGhost]}
                >
                  <Text style={styles.modalBtnGhostText}>İptal</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    props.onChange(dateToPlanTime(iosTemp));
                    setIosOpen(false);
                  }}
                  style={[styles.modalBtn, styles.modalBtnPrimary]}
                >
                  <Text style={styles.modalBtnPrimaryText}>Tamam</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      {props.errorText ? <Text style={styles.error}>{props.errorText}</Text> : null}
      {!props.errorText && props.helperText ? (
        <Text style={styles.helper}>{props.helperText}</Text>
      ) : null}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: { gap: 8 },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    label: {
      color: theme.color.textSecondary,
      fontSize: theme.font.small,
      fontWeight: '700',
      flex: 1,
    },
    clearText: {
      color: theme.color.primary,
      fontSize: theme.font.tiny,
      fontWeight: '800',
    },
    input: {
      backgroundColor: theme.color.surface,
      borderWidth: 1.5,
      borderColor: theme.color.border,
      borderRadius: theme.radius.md,
      paddingVertical: 14,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    inputError: { borderColor: theme.color.danger, borderWidth: 2 },
    value: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '700', flex: 1 },
    placeholder: { color: theme.color.muted, fontWeight: '600' },
    chevron: { fontSize: 18, marginLeft: 8 },
    helper: { color: theme.color.muted, fontSize: theme.font.small, lineHeight: 20 },
    error: { color: theme.color.danger, fontSize: theme.font.small, fontWeight: '700' },
    modalBackdrop: {
      flex: 1,
      backgroundColor: theme.color.overlayDark,
      justifyContent: 'center',
      padding: theme.space.lg,
    },
    modalCard: {
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.xl,
      padding: theme.space.lg,
      borderWidth: 1,
      borderColor: theme.color.border,
      ...theme.shadowCard,
    },
    modalTitle: {
      color: theme.color.text,
      fontSize: theme.font.h2,
      fontWeight: '800',
      marginBottom: theme.space.sm,
      textAlign: 'center',
    },
    iosPicker: { alignSelf: 'stretch' },
    modalActions: {
      flexDirection: 'row',
      gap: theme.space.sm,
      marginTop: theme.space.md,
      justifyContent: 'flex-end',
    },
    modalBtn: {
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: theme.radius.pill,
    },
    modalBtnGhost: { backgroundColor: theme.color.inputBg },
    modalBtnGhostText: { color: theme.color.text, fontWeight: '700', fontSize: theme.font.small },
    modalBtnPrimary: { backgroundColor: theme.color.primary },
    modalBtnPrimaryText: {
      color: theme.color.surface,
      fontWeight: '800',
      fontSize: theme.font.small,
    },
  });
}
