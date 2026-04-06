import { useMemo } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SponsoredVenue } from '../constants/monetization';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

export function SponsoredVenuesSection(props: { venues: SponsoredVenue[] }) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (!props.venues.length) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>Sponsorlu öneriler</Text>
      <Text style={styles.sectionSub}>İşletmelerden seçilmiş mekanlar</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {props.venues.map((v) => (
          <Pressable
            key={v.id}
            onPress={() => void Linking.openURL(v.targetUrl)}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
            accessibilityRole="link"
            accessibilityLabel={`${v.title}, sponsorlu`}
          >
            <Text style={styles.badge}>Sponsorlu</Text>
            <Text style={styles.title} numberOfLines={2}>
              {v.title}
            </Text>
            <Text style={styles.sub} numberOfLines={2}>
              {v.subtitle}
            </Text>
            <Text style={styles.cta}>{v.ctaLabel} →</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function createStyles(t: AppTheme) {
  return StyleSheet.create({
    wrap: {
      marginBottom: t.space.lg,
    },
    sectionTitle: {
      color: t.color.text,
      fontSize: t.font.small,
      fontWeight: '900',
      marginBottom: 4,
    },
    sectionSub: {
      color: t.color.muted,
      fontSize: t.font.tiny,
      fontWeight: '600',
      marginBottom: t.space.sm,
    },
    row: {
      gap: t.space.sm,
      paddingRight: t.space.md,
    },
    card: {
      width: 200,
      padding: t.space.md,
      borderRadius: t.radius.lg,
      backgroundColor: t.color.surface,
      borderWidth: 1,
      borderColor: t.color.cardBorderPrimary,
    },
    badge: {
      alignSelf: 'flex-start',
      fontSize: 10,
      fontWeight: '800',
      color: t.color.primaryDark,
      backgroundColor: t.color.primarySoft,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: t.radius.pill,
      overflow: 'hidden',
      marginBottom: 8,
    },
    title: { color: t.color.text, fontSize: t.font.body, fontWeight: '800', marginBottom: 4 },
    sub: { color: t.color.muted, fontSize: t.font.tiny, lineHeight: 18, marginBottom: 8 },
    cta: { color: t.color.primary, fontSize: t.font.tiny, fontWeight: '800' },
  });
}
