import { useMemo } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

export function TextField(props: {
  label: string;
  value: string;
  placeholder?: string;
  keyboardType?: 'default' | 'phone-pad' | 'number-pad';
  onChangeText: (v: string) => void;
  helperText?: string;
  errorText?: string;
  autoFocus?: boolean;
  maxLength?: number;
}) {
  const theme = useAppTheme();
  const styles = useMemo(() => createTextFieldStyles(theme), [theme]);
  const hasError = Boolean(props.errorText);
  return (
    <View style={styles.wrap}>
      {props.label ? <Text style={styles.label}>{props.label}</Text> : null}
      <TextInput
        style={[styles.input, theme.shadowSoft, hasError ? styles.inputError : null]}
        placeholder={props.placeholder}
        placeholderTextColor={theme.color.muted}
        value={props.value}
        keyboardType={props.keyboardType}
        onChangeText={props.onChangeText}
        autoFocus={props.autoFocus}
        maxLength={props.maxLength}
      />
      {props.errorText ? <Text style={styles.error}>{props.errorText}</Text> : null}
      {!props.errorText && props.helperText ? <Text style={styles.helper}>{props.helperText}</Text> : null}
    </View>
  );
}

function createTextFieldStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: { gap: 8 },
    label: { color: theme.color.textSecondary, fontSize: theme.font.small, fontWeight: '700' },
    input: {
      backgroundColor: theme.color.surface,
      borderWidth: 1.5,
      borderColor: theme.color.border,
      color: theme.color.text,
      borderRadius: theme.radius.md,
      paddingVertical: 14,
      paddingHorizontal: 16,
      fontSize: theme.font.body,
      fontWeight: '600',
    },
    inputError: { borderColor: theme.color.danger, borderWidth: 2 },
    helper: { color: theme.color.muted, fontSize: theme.font.small, lineHeight: 20 },
    error: { color: theme.color.danger, fontSize: theme.font.small, fontWeight: '700' },
  });
}
