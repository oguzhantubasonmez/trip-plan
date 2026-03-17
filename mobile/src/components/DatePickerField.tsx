import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale/tr';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

type Props = {
  label: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  minDate?: Date;
  maxDate?: Date;
  errorText?: string;
};

const isWeb = Platform.OS === 'web';

export function DatePickerField(props: Props) {
  const [openNative, setOpenNative] = useState(false);

  const display = useMemo(() => {
    if (!props.value) return '';
    try {
      return format(props.value, 'd MMM yyyy', { locale: tr });
    } catch {
      return props.value.toISOString().slice(0, 10);
    }
  }, [props.value]);

  if (isWeb) {
    // Lazy import to keep native bundles clean
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ReactDatePicker = require('react-datepicker').default as any;
    require('react-datepicker/dist/react-datepicker.css');

    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>{props.label}</Text>
        <View style={[styles.input, props.errorText ? styles.inputError : null]}>
          <ReactDatePicker
            selected={props.value}
            onChange={(d: Date | null) => props.onChange(d)}
            minDate={props.minDate}
            maxDate={props.maxDate}
            dateFormat="yyyy-MM-dd"
            placeholderText="Tarih seç"
            popperPlacement="bottom-start"
            popperClassName="rwDatePickerPopper"
            wrapperClassName="rwDatePickerWrapper"
            className="rwDatePickerInput"
          />
        </View>
        {props.errorText ? <Text style={styles.error}>{props.errorText}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{props.label}</Text>
      <Pressable
        onPress={() => setOpenNative(true)}
        style={({ pressed }) => [
          styles.input,
          pressed ? { opacity: 0.95 } : null,
          props.errorText ? styles.inputError : null,
        ]}
      >
        <Text style={[styles.value, !props.value ? styles.placeholder : null]}>
          {props.value ? display : 'Tarih seç'}
        </Text>
      </Pressable>

      {openNative ? (
        <DateTimePicker
          value={props.value ?? new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={props.minDate}
          maximumDate={props.maxDate}
          onChange={(_, d) => {
            setOpenNative(false);
            if (d) props.onChange(d);
          }}
        />
      ) : null}

      {props.errorText ? <Text style={styles.error}>{props.errorText}</Text> : null}
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
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  inputError: { borderColor: theme.color.danger },
  value: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '700' },
  placeholder: { color: theme.color.muted, fontWeight: '600' },
  error: { color: theme.color.danger, fontSize: theme.font.small, fontWeight: '600' },
});

