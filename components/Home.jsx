import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ScrollView,
  BackHandler,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

export default function Home() {
  const router = useRouter();

  useFocusEffect(
    React.useCallback(() => {
      const disableBack = () => true; // Disable hardware back button
      BackHandler.addEventListener("hardwareBackPress", disableBack);

      return () => {
        BackHandler.removeEventListener("hardwareBackPress", disableBack);
      };
    }, [])
  );

  const [userForms, setUserForms] = useState([]);
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchUserForms = async () => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      console.log("🔑 Token recuperado:", token); // Debugger para verificar el token
      if (!token) throw new Error("No authentication token found");

      const response = await fetch(
        "https://54b8-179-33-13-68.ngrok-free.app/forms/users/form_by_user",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();
      console.log("📋 Respuesta completa del servidor:", data); // Debugger para verificar la respuesta completa

      if (!response.ok) {
        console.error("❌ Error en la respuesta del servidor:", data.detail);
        throw new Error(data.detail || "Error fetching user forms");
      }

      setUserForms(data);

      // Guardar formularios únicos en AsyncStorage
      await AsyncStorage.setItem("offline_forms", JSON.stringify(data));
    } catch (error) {
      console.error("❌ Error al obtener los formularios del usuario:", error);
      Alert.alert(
        "Error",
        "No se pudieron cargar los formularios del usuario."
      );
    } finally {
      setLoading(false);
    }
  };

  const loadOfflineForms = async () => {
    try {
      const storedForms = await AsyncStorage.getItem("offline_forms");
      if (storedForms) {
        const parsedForms = JSON.parse(storedForms);

        // Filtrar formularios duplicados por ID
        const uniqueForms = parsedForms.filter(
          (form, index, self) =>
            index === self.findIndex((f) => f.id === form.id)
        );

        setUserForms(uniqueForms);
      } else {
        Alert.alert("Modo Offline", "No hay datos guardados para mostrar.");
      }
    } catch (error) {
      console.error("❌ Error cargando formularios offline:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.setItem("isLoggedOut", "true");
      router.push("/");
    } catch (error) {
      Alert.alert("Error", "No se pudo cerrar sesión. Inténtalo de nuevo.");
    }
  };

  const handleFormPress = (form) => {
    console.log("📋 Formulario seleccionado:", form); // Log the selected form
    router.push({
      pathname: "/format-screen",
      params: {
        id: form.id,
        created_at: form.created_at,
        title: form.title,
      },
    });
  };

  const handleNavigateToMyForms = () => {
    router.push("/my-forms");
  };

  const handleNavigateToPendingForms = () => {
    router.push("/pending-forms");
  };

  useEffect(() => {
    const checkNetworkStatus = async () => {
      const state = await NetInfo.fetch();
      setIsOffline(!state.isConnected);

      if (state.isConnected) {
        fetchUserForms();

        // Synchronize pending forms when back online
        const storedPendingForms = await AsyncStorage.getItem("pending_forms");
        const pendingForms = storedPendingForms
          ? JSON.parse(storedPendingForms)
          : [];
        for (const form of pendingForms) {
          try {
            const token = await AsyncStorage.getItem("authToken");
            if (!token) throw new Error("No authentication token found");

            const requestOptions = {
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            };

            // Submit the form
            const saveResponseRes = await fetch(
              `https://54b8-179-33-13-68.ngrok-free.app/responses/save-response/${form.id}`,
              {
                method: "POST",
                headers: requestOptions.headers,
                body: JSON.stringify({ mode: "offline" }),
              }
            );

            const saveResponseData = await saveResponseRes.json();
            const responseId = saveResponseData.response_id;

            // Submit each answer
            for (const response of form.responses) {
              await fetch(
                `https://54b8-179-33-13-68.ngrok-free.app/responses/save-answers`,
                {
                  method: "POST",
                  headers: requestOptions.headers,
                  body: JSON.stringify({
                    response_id: responseId,
                    question_id: response.question_id,
                    answer_text: response.answer_text,
                    file_path: response.file_path,
                  }),
                }
              );
            }

            // Remove the form from pending forms
            const updatedPendingForms = pendingForms.filter(
              (f) => f.id !== form.id
            );
            await AsyncStorage.setItem(
              "pending_forms",
              JSON.stringify(updatedPendingForms)
            );
          } catch (error) {
            console.error(
              "❌ Error al sincronizar formulario pendiente:",
              error
            );
          }
        }
      } else {
        loadOfflineForms();
      }
    };

    checkNetworkStatus();

    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
    });

    return () => unsubscribe();
  }, []);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Formatos Asignados</Text>
      <Text style={isOffline ? styles.offlineText : styles.onlineText}>
        Estado: {isOffline ? "Offline ◉" : "Online ◉"}
      </Text>
      {loading ? (
        <Text>Cargando...</Text>
      ) : (
        userForms &&
        userForms.map(
          (form) =>
            form && ( // Validación para evitar errores si `form` es null o undefined
              <TouchableOpacity
                key={form.id}
                style={styles.formItem}
                onPress={() => handleFormPress(form)}
              >
                <Text style={styles.formText}>Formato: {form.title}</Text>
                <Text style={styles.formDescription}>
                  Descripción: {form.description}
                </Text>
              </TouchableOpacity>
            )
        )
      )}
      <TouchableOpacity onPress={handleNavigateToMyForms} style={styles.button}>
        <Text style={styles.buttonText}>Ver formularios diligenciados</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={handleNavigateToPendingForms}
        style={styles.button}
      >
        <Text style={styles.buttonText}>
          Ver formularios pendientes de envío
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
        <Text style={styles.logoutText}>Cerrar Sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#ffffff" },
  header: { fontSize: 20, fontWeight: "bold", marginBottom: 10 },
  onlineText: { color: "green", fontWeight: "bold", marginBottom: 10 },
  offlineText: { color: "red", fontWeight: "bold", marginBottom: 10 },
  formItem: {
    padding: 10,
    backgroundColor: "#f0f0f0",
    borderRadius: 5,
    marginBottom: 10,
  },
  formText: { fontSize: 16, fontWeight: "bold" },
  formDescription: { fontSize: 14, color: "#555" },
  button: {
    marginTop: 10,
    padding: 10,
    backgroundColor: "#2563eb",
    borderRadius: 5,
    alignItems: "center",
  },
  buttonText: {
    color: "white",
    fontWeight: "bold",
  },
  logoutButton: {
    marginTop: 20,
    padding: 10,
    backgroundColor: "red",
    borderRadius: 5,
    alignItems: "center",
  },
  logoutText: {
    color: "white",
    fontWeight: "bold",
  },
});
