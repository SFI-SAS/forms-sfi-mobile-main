import React, { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";

import { Main } from "./components/Main";
import Home from "./components/Home";
import FormatScreen from "./components/FormatScreen";
import MyForms from "./components/MyForms";
import PendingForms from "./components/PendingForms";

// ✅ NUEVO: Importar sistema de manejo de errores
import ErrorBoundary from "./components/ErrorBoundary";
import { initializeLogger } from "./utils/errorLogger";
import { initializeErrorHandlers } from "./utils/globalErrorHandler";

const Stack = createStackNavigator();

export default function App() {
  useEffect(() => {
    // ✅ Inicializar sistema de logs al arrancar la app
    const initializeErrorSystem = async () => {
      try {
        console.log("🚀 Inicializando sistema de errores...");

        // Inicializar logger
        await initializeLogger();

        // Instalar handlers globales de errores
        initializeErrorHandlers();

        console.log("✅ Sistema de errores inicializado correctamente");
      } catch (error) {
        console.error("❌ Error inicializando sistema de errores:", error);
      }
    };

    initializeErrorSystem();
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
