import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Contacts from 'expo-contacts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

export const CONTACTS_ONBOARDING_SEEN_KEY = 'rw.contactsOnboardingSeen.v1';

export function ContactsOnboardingScreen(props: { onDone: () => void }) {
  const appTheme = useAppTheme();
  const styles = useMemo(() => createContactsOnboardingStyles(appTheme), [appTheme]);
  const [loading, setLoading] = useState(false);
  const autoAdvanced = useRef(false);

  async function finishAndContinue() {
    await AsyncStorage.setItem(CONTACTS_ONBOARDING_SEEN_KEY, '1');
    props.onDone();
  }

  const onDoneRef = useRef(props.onDone);
  onDoneRef.current = props.onDone;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const perm = await Contacts.getPermissionsAsync();
        if (!alive || autoAdvanced.current) return;
        if (perm.status === 'granted') {
          autoAdvanced.current = true;
          await AsyncStorage.setItem(CONTACTS_ONBOARDING_SEEN_KEY, '1');
          if (alive) onDoneRef.current();
        }
      } catch {
        /* kullanıcı yine de manuel akışı görür */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function requestPermission() {
    setLoading(true);
    try {
      await Contacts.requestPermissionsAsync();
      await finishAndContinue();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Arkadaş Davet</Text>
        </View>
        <Text style={styles.title}>Rehberine erişelim mi?</Text>
        <Text style={styles.sub}>
          Arkadaşlarını rotana kolayca ekleyebilmen ve rehberindeki kişilerin planlarını görebilmen için kişi listene
          erişmek istiyoruz. Verilerin asla üçüncü taraflarla paylaşılmaz.
        </Text>
      </View>

      <View style={styles.card}>
        <PrimaryButton title="Erişime izin ver" onPress={requestPermission} loading={loading} />
        <View style={{ height: appTheme.space.sm }} />
        <Text onPress={finishAndContinue} style={styles.skip}>
          Şimdilik atla
        </Text>
      </View>
    </Screen>
  );
}

function createContactsOnboardingStyles(t: AppTheme) {
  return StyleSheet.create({
    hero: { gap: 10, marginBottom: t.space.lg },
    badge: {
      alignSelf: 'flex-start',
      backgroundColor: t.color.primarySoft,
      borderRadius: t.radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    badgeText: { color: t.color.text, fontSize: t.font.small, fontWeight: '700' },
    title: { color: t.color.text, fontSize: t.font.h1, fontWeight: '900', letterSpacing: 0.1 },
    sub: { color: t.color.muted, fontSize: t.font.body, lineHeight: 22 },
    card: {
      marginTop: 'auto',
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    skip: {
      color: t.color.muted,
      fontSize: t.font.small,
      textAlign: 'center',
      textDecorationLine: 'underline',
    },
  });
}
