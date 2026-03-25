import { Image, StyleSheet, View } from 'react-native';

type Props = {
  size?: number;
};

/** Uygulama logosu — `assets/logo.png` */
export function AppLogo({ size = 80 }: Props) {
  const src = require('../../assets/logo.png');
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Image
        source={src}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityLabel="RouteWise logosu"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
