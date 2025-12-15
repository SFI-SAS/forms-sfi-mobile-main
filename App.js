import React, { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";

import { Main } from "./components/Main";
import Home from "./components/Home";
import FormatScreen from "./components/FormatScreen.tsx";
import MyForms from "./components/MyForms";
import PendingForms from "./components/PendingForms";

// ✅ NUEVO: Importar sistema de manejo de errores
import ErrorBoundary from "./components/ErrorBoundary";
import { initializeLogger } from "./utils/errorLogger";
import { initializeErrorHandlers } from "./utils/globalErrorHandler";
import crashlyticsService from "./services/crashlytics";
// ✅ NUEVO: Importar sistema offline/online
import { initializeOfflineManager } from "./services/offlineManager";

const Stack = createStackNavigator();

export default function App() {
  useEffect(() => {
    // ✅ Inicializar sistema de logs y offline manager al arrancar la app
    const initializeApp = async () => {
      try {
        console.log("🚀 Inicializando aplicación...");

        // ✅ Inicializar Firebase Crashlytics
        await crashlyticsService.initialize();

        // Inicializar logger
        await initializeLogger();

        // Instalar handlers globales de errores
        initializeErrorHandlers();

        // ✅ Inicializar gestor offline/online
        initializeOfflineManager();

        console.log("✅ Aplicación inicializada correctamente");
      } catch (error) {
        console.error("❌ Error inicializando aplicación:", error);
        crashlyticsService.recordError(error, "App.js - initializeApp");
      }
    };

    initializeApp();
  }, []);

  return (
    <ErrorBoundary>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Main">
          <Stack.Screen
            name="Main"
            component={Main} // Ensure Main is registered here
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Home"
            component={Home} // Ensure Home is registered here
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="FormatScreen"
            component={FormatScreen}
            options={{ title: "Format Details" }}
          />
          <Stack.Screen
            name="MyForms"
            component={MyForms}
            options={{ title: "Formularios Diligenciados" }}
          />
          <Stack.Screen
            name="PendingForms"
            component={PendingForms}
            options={{ title: "Formularios Pendientes" }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </ErrorBoundary>
  );
}
