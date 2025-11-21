import { Stack, useRouter, useSegments } from "expo-router";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Logo } from "../components/Logo";
import React, { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import DrawerNavigator from "../components/DrawerNavigator";
import HamburgerButton from "../components/HamburgerButton";

export default function Layout() {
  const router = useRouter();
  const segments = useSegments();
  const [activeRoute, setActiveRoute] = useState("home");
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [isOffline, setIsOffline] = useState(false);
  const insets = useSafeAreaInsets();

  // Cargar info del usuario
  useEffect(() => {
    loadUserInfo();
  }, []);

  // Detectar estado de conexión
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
    });

    // Check inicial
    NetInfo.fetch().then((state) => {
      setIsOffline(!state.isConnected);
    });

    return () => unsubscribe();
  }, []);

  const loadUserInfo = async () => {
    try {
      const stored = await AsyncStorage.getItem("user_info_offline");
      if (stored) {
        setUserInfo(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Error loading user info:", error);
    }
  };

  // Detecta la ruta actual para mantener activa
  useEffect(() => {
    const path = segments.join("/");
    if (path.includes("my-forms")) setActiveRoute("my-forms");
    else if (path.includes("pending-forms")) setActiveRoute("pending-forms");
    else if (path.includes("approvals")) setActiveRoute("approvals");
    else if (path.includes("settings")) setActiveRoute("settings");
    else if (path === "" || path.includes("home")) setActiveRoute("home");
  }, [segments]);

  // Maneja la navegación desde el drawer
  const handleNavigate = async (route, routeId) => {
    if (route === "logout") {
      // Limpia token y marca sesión cerrada
      await AsyncStorage.setItem("isLoggedOut", "true");
      await AsyncStorage.removeItem("authToken");
      router.replace("/");
    } else {
      if (routeId) setActiveRoute(routeId);
      router.replace(route);
    }
  };

  // Determina si mostrar el botón hamburguesa
  const currentPath = segments.join("/");
  const isLoginScreen =
    segments.includes("main") || currentPath === "" || currentPath === "/";
  const showHamburger = !isLoginScreen;

  return (
    <View style={styles.container}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "white" },
          headerTintColor: "black",
          headerTitle: () => <Logo />,
          headerTitleAlign: "center",
          headerBackVisible: false,
          headerLeft: () =>
            showHamburger ? (
              <HamburgerButton
                onPress={() => setDrawerVisible(true)}
                color="#12A0AF"
              />
            ) : null,
        }}
      />

      {/* Drawer Navigator */}
      <DrawerNavigator
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        activeRoute={activeRoute}
        onNavigate={handleNavigate}
        userInfo={userInfo}
        isOffline={isOffline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
  },
});
