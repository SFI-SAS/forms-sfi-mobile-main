import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import useNetInfo from "../hooks/useNetInfo";

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
            const response = await fetch(
              `https://1943-179-33-13-68.ngrok-free.app/save-response/${form.id}?mode=offline`,
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
