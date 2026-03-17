import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Contacts from 'expo-contacts';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { theme } from '../theme';

export const CONTACTS_ONBOARDING_SEEN_KEY = 'rw.contactsOnboardingSeen.v1';

export function ContactsOnboardingScreen(props: { onDone: () => void }) {
  const [loading, setLoading] = useState(false);

  async function finishAndContinue() {
    await AsyncStorage.setItem(CONTACTS_ONBOARDING_SEEN_KEY, '1');
    props.onDone();
  }

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
        <View style={{ height: theme.space.sm }} />
        <Text onPress={finishAndContinue} style={styles.skip}>
          Şimdilik atla
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 10, marginBottom: theme.space.lg },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.color.primarySoft,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  badgeText: { color: theme.color.text, fontSize: theme.font.small, fontWeight: '700' },
  title: { color: theme.color.text, fontSize: theme.font.h1, fontWeight: '900', letterSpacing: 0.1 },
  sub: { color: theme.color.muted, fontSize: theme.font.body, lineHeight: 22 },
  card: {
    marginTop: 'auto',
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  skip: {
    color: theme.color.muted,
    fontSize: theme.font.small,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});

