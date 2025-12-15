/**
 * ConnectionIndicator.jsx
 * Indicador visual del estado de conexión online/offline
 */

import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import NetInfo from "@react-native-community/netinfo";

const ConnectionIndicator = () => {
  const [isConnected, setIsConnected] = useState(null);
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected === true;
      setIsConnected(connected);

      // Animar entrada/salida
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // Auto-ocultar después de 3 segundos si está online
      if (connected) {
        setTimeout(() => {
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }).start();
        }, 3000);
      }
    });

    return () => unsubscribe();
  }, [fadeAnim]);

  // No mostrar nada si no sabemos el estado aún
  if (isConnected === null) return null;

  // Si está online, mostrar temporalmente
  // Si está offline, mostrar permanentemente
  if (isConnected && fadeAnim._value === 0) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        isConnected ? styles.online : styles.offline,
        { opacity: fadeAnim },
      ]}
    >
      <View
        style={[styles.dot, isConnected ? styles.dotOnline : styles.dotOffline]}
      />
      <Text style={styles.text}>
        {isConnected ? "🌐 Conectado" : "📵 Modo Offline"}
      </Text>
      {!isConnected && (
        <Text style={styles.subtext}>Los datos se guardarán localmente</Text>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 10,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 999,
    maxWidth: "80%",
    pointerEvents: "none",
  },
  online: {
    backgroundColor: "#10B981", // green-500
  },
  offline: {
    backgroundColor: "#F59E0B", // yellow-500
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  dotOnline: {
    backgroundColor: "#FFFFFF",
  },
  dotOffline: {
    backgroundColor: "#FFFFFF",
  },
  text: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  subtext: {
    color: "#FFFFFF",
    fontSize: 11,
    opacity: 0.9,
    marginLeft: 8,
  },
});

export default ConnectionIndicator;
