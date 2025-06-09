import React, { useEffect } from "react";
import { View, Text, StyleSheet, Dimensions, Animated } from "react-native";

const { width, height } = Dimensions.get("window");
const matrixCharacters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@+-*/°=&%$#!¡¿?";
const matrixColumns = Math.floor(width / 20); // Número de columnas de letras

const MatrixBackground = () => {
  const animations = Array.from({ length: matrixColumns }).map(
    () => new Animated.Value(0)
  );

  useEffect(() => {
    const animationsArray = animations.map((animation) => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(animation, {
            toValue: height,
            duration: 2000 + Math.random() * 3000, // Duración variable para cada columna
            useNativeDriver: true,
          }),
          Animated.timing(animation, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
    });

    animationsArray.forEach((animation) => animation.start());
  }, [animations]);

  return (
    <View style={StyleSheet.absoluteFillObject}>
      {animations.map((animation, index) => (
        <Animated.Text
          key={index}
          style={[
            styles.matrixText,
            {
              left: index * 20,
              transform: [{ translateY: animation }],
            },
          ]}
        >
          {matrixCharacters.charAt(
            Math.floor(Math.random() * matrixCharacters.length)
          )}
        </Animated.Text>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  matrixText: {
    position: "absolute",
    color: "#12A0AF", // Color azul para el estilo Matrix
    fontSize: 18,
    fontFamily: "Lucida console",
    fontWeight: "bold",
    opacity: 0.5,
  },
});

export default MatrixBackground;
