import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ScrollView,
  BackHandler,
  Dimensions, // Import Dimensions
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

const { width, height } = Dimensions.get("window"); // Get screen dimensions

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
      if (!response.ok) {
        throw new Error(data.detail || "Error fetching user forms");
      }

      setUserForms(data);

      // Cache forms for offline access
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
        setUserForms(JSON.parse(storedForms));
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
              `https://54b8-179-33-13-68.ngrok-free.app/responses/save-response/${form.id}?mode=offline`,
              {
                method: "POST",
                headers: requestOptions.headers,
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
        <Text style={styles.loadingText}>Cargando...</Text>
      ) : (
        <View style={styles.formsContainer}>
          <ScrollView>
            {userForms &&
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
              )}
          </ScrollView>
        </View>
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
  container: { flex: 1, padding: width * 0.05, backgroundColor: "#ffffff" },
  header: {
    fontSize: width * 0.06,
    fontWeight: "bold",
    marginBottom: height * 0.02,
  },
  onlineText: {
    color: "green",
    fontWeight: "bold",
    marginBottom: height * 0.01,
  },
  offlineText: {
    color: "red",
    fontWeight: "bold",
    marginBottom: height * 0.01,
  },
  loadingText: {
    fontSize: width * 0.05,
    textAlign: "center",
    marginVertical: height * 0.02,
  },
  formsContainer: {
    maxHeight: height * 0.5, // Limit height to half the screen
    marginBottom: height * 0.02,
  },
  formItem: {
    padding: width * 0.04,
    backgroundColor: "#f0f0f0",
    borderRadius: width * 0.02,
    marginBottom: height * 0.02,
  },
  formText: { fontSize: width * 0.05, fontWeight: "bold" },
  formDescription: { fontSize: width * 0.04, color: "#555" },
  button: {
    marginTop: height * 0.02,
    padding: height * 0.02,
    backgroundColor: "#2563eb",
    borderRadius: width * 0.02,
    alignItems: "center",
  },
  buttonText: { color: "white", fontWeight: "bold", fontSize: width * 0.045 },
  logoutButton: {
    marginTop: height * 0.03,
    padding: height * 0.02,
    backgroundColor: "red",
    borderRadius: width * 0.02,
    alignItems: "center",
  },
  logoutText: { color: "white", fontWeight: "bold", fontSize: width * 0.045 },
});
