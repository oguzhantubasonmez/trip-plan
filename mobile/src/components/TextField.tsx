import { StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from '../theme';

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
  const hasError = Boolean(props.errorText);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={[styles.input, hasError ? styles.inputError : null]}
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

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { color: theme.color.muted, fontSize: theme.font.small, fontWeight: '600' },
  input: {
    backgroundColor: theme.color.inputBg,
    borderWidth: 1,
    borderColor: theme.color.border,
    color: theme.color.text,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: theme.font.body,
  },
  inputError: { borderColor: theme.color.danger },
  helper: { color: theme.color.muted, fontSize: theme.font.small, lineHeight: 18 },
  error: { color: theme.color.danger, fontSize: theme.font.small, fontWeight: '600' },
});

