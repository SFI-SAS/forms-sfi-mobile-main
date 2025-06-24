import { Stack, useRouter, useSegments } from "expo-router";
import { View } from "react-native";
import { Logo } from "../components/Logo";
import React, { useState, useEffect } from "react";
import BottomTabBar from "../components/BottomTabBar";
import AsyncStorage from "@react-native-async-storage/async-storage";

const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutos

export default function Layout() {
  const router = useRouter();
  const segments = useSegments();
  const [activeTab, setActiveTab] = useState("home");

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
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "white" },
          headerTintColor: "black",
          headerTitle: () => <Logo />,
          headerTitleAlign: "center",
          headerBackVisible: false,
        }}
      />
      {showTabBar && (
        <BottomTabBar activeTab={activeTab} onTabPress={handleTabPress} />
      )}
    </View>
  );
}
