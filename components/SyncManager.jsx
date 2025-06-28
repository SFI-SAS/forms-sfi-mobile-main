import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import useNetInfo from "../hooks/useNetInfo";

// Añade soporte para URL personalizable
const BACKEND_URL_KEY = "backend_url";
const getBackendUrl = async () => {
  const stored = await AsyncStorage.getItem(BACKEND_URL_KEY);
  return stored || "";
};

const SyncManager = () => {
  const isConnected = useNetInfo();

  useEffect(() => {
    const syncResponses = async () => {
      if (isConnected) {
        const storedPendingForms = await AsyncStorage.getItem("pending_forms");
        const pendingForms = storedPendingForms
          ? JSON.parse(storedPendingForms)
          : [];

        for (const form of pendingForms) {
          try {
            const token = await AsyncStorage.getItem("authToken");
            const backendUrl = await getBackendUrl();
            const response = await fetch(
              `${backendUrl}/save-response/${form.id}?mode=offline`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(form),
              }
            );

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(errorText);
            }

            console.log(`✅ Formulario ${form.id} sincronizado correctamente.`);
          } catch (error) {
            console.error(
              `❌ Error sincronizando formulario ${form.id}:`,
              error
            );
          }
        }

        await AsyncStorage.removeItem("pending_forms");
      }
    };

    syncResponses();
  }, [isConnected]);

  return null;
};

export default SyncManager;
