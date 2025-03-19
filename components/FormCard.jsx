import { useEffect, useRef } from "react";
import {
  StyleSheet,
  Image,
  Text,
  View,
  Animated,
  Pressable,
  Button,
} from "react-native";
import { Link } from "expo-router";
import { styled } from "nativewind";
const image = require("../assets/foundimg.png");

const StyledPressable = styled(Pressable);

export function FormCard({ form }) {
  const ref = useRef();
  return (
    <StyledPressable
      className="active:opacity-70 
      active:border-white/50 mb-2 rounded-xl"
    >
      <View className="flex-row gap-4" key={form.id} style={styles.container}>
        <Image source={image} style={styles.image} />
        <View className="flex-shrink">
          <Text className="mb-1" style={styles.title}>
            {form.title}
          </Text>
          <Text className="mt-2 flex-shrink" style={styles.description}>
            {form.description.slice(0, 100)} ...
          </Text>
          <Link href={`/${form.id}`} asChild>
            <Button ref={ref} title="Responder formulario" />
          </Link>
        </View>
      </View>
    </StyledPressable>
  );
}

export function AnimatedFormCard({ form, index }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 1000,
      delay: index * 250,
      useNativeDriver: true,
    }).start();
  }, [opacity, index]);

  return (
    <Animated.View style={{ opacity }}>
      <FormCard form={form} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginStart: 1,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 }, // Aumenta el desplazamiento vertical
    shadowOpacity: 0.3, // Aumenta la opacidad para más oscuridad
    shadowRadius: 10, // Aumenta el radio para una sombra más suave
    elevation: 8,
    marginTop: 3,
  },
  card: {
    marginBottom: 42,
  },
  image: {
    width: 107,
    height: 137,
    borderRadius: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 10,
    color: "#000",
  },
  description: {
    fontSize: 16,
    color: "#000",
  },
});
