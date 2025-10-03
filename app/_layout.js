import { Stack, useRouter, useSegments } from "expo-router";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logo } from "../components/Logo";
import React, { useState, useEffect } from "react";
import BottomTabBar from "../components/BottomTabBar";
import AsyncStorage from "@react-native-async-storage/async-storage";

const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutos
const TAB_BAR_HEIGHT = 15; // Ajusta según la altura real de tu BottomTabBar

export default function Layout() {
  const router = useRouter();
  const segments = useSegments();
  const [activeTab, setActiveTab] = useState("home");
  const insets = useSafeAreaInsets();

  // Detecta la ruta actual para mantener el tab activo
  useEffect(() => {
    const path = segments.join("/");
    if (path.includes("my-forms")) setActiveTab("my-forms");
    else if (path.includes("pending-forms")) setActiveTab("pending-forms");
    else if (path === "" || path.includes("home")) setActiveTab("home");
  }, [segments]);

  // Maneja la navegación global desde la tab-bar
  const handleTabPress = async (tab) => {
    setActiveTab(tab);
    if (tab === "home") router.replace("/home");
    if (tab === "my-forms") router.replace("/my-forms");
    if (tab === "pending-forms") router.replace("/pending-forms");
    if (tab === "approvals") router.replace("/approvals");
    if (tab === "settings") router.replace("/settings"); // NUEVO
    if (tab === "logout") {
      // Limpia token y marca sesión cerrada
      await AsyncStorage.setItem("isLoggedOut", "true");
      await AsyncStorage.removeItem("authToken");
      router.replace("/");
    }
  };

  // Solo muestra la tab-bar si NO estamos en la pantalla de login (main o /)
  const showTabBar =
    !segments.includes("main") &&
    segments[0] !== "" &&
    segments[0] !== undefined &&
    segments[0] !== null &&
    segments[0] !== "/" &&
    segments.join("/") !== "" &&
    segments.join("/") !== "main";

  return (
    <View style={styles.container}>
      <View 
        style={[
          styles.content,
          {
            paddingBottom: showTabBar ? TAB_BAR_HEIGHT + insets.bottom : insets.bottom
          }
        ]}
      >
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: "white" },
            headerTintColor: "black",
            headerTitle: () => <Logo />,
            headerTitleAlign: "center",
            headerBackVisible: false,
          }}
        />
      </View>
      {showTabBar && (
        <View style={[styles.tabBarContainer, { paddingBottom: insets.bottom }]}>
          <BottomTabBar activeTab={activeTab} onTabPress={handleTabPress} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  content: {
    flex: 1,
  },
  tabBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    elevation: 10, // Para Android
    shadowOffset: { width: 0, height: -2 }, // Para iOS
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
});