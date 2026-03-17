import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

export function PrimaryButton(props: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={props.testID}
      onPress={props.onPress}
      disabled={props.disabled || props.loading}
      style={({ pressed }) => [
        styles.btn,
        pressed && !props.disabled && !props.loading ? styles.pressed : null,
        props.disabled || props.loading ? styles.disabled : null,
      ]}
    >
      <View style={styles.inner}>
        <Text style={styles.text}>{props.loading ? '...' : props.title}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: theme.color.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  pressed: { opacity: 0.92 },
  disabled: { opacity: 0.55 },
  inner: { alignItems: 'center', justifyContent: 'center' },
  text: {
    color: theme.color.text,
    fontSize: theme.font.body,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

