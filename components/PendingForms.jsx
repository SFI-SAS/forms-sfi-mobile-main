import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  BackHandler,
  Dimensions, // Import Dimensions
  Modal,
  TextInput,
  Keyboard,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router"; // Add this import
import { HomeIcon } from "./Icons"; // Adjust the import path as necessary

const { width, height } = Dimensions.get("window"); // Get screen dimensions
const INACTIVITY_TIMEOUT = 8 * 60 * 1000; // 8 minutos

export default function PendingForms() {
  const [pendingForms, setPendingForms] = useState([]);
  const [isOnline, setIsOnline] = useState(false);
  const router = useRouter();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const inactivityTimer = useRef(null);

  useFocusEffect(
    React.useCallback(() => {
      const disableBack = () => true; // Disable hardware back button
      BackHandler.addEventListener("hardwareBackPress", disableBack);

      return () => {
        BackHandler.removeEventListener("hardwareBackPress", disableBack);
      };
    }, [])
  );

  useEffect(() => {
    const resetInactivityTimer = async () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      inactivityTimer.current = setTimeout(async () => {
        await AsyncStorage.setItem("isLoggedOut", "true");
        setShowLogoutModal(true);
      }, INACTIVITY_TIMEOUT);
    };

    const reset = () => resetInactivityTimer();
    const keyboardListener = Keyboard.addListener("keyboardDidShow", reset);
    const interval = setInterval(reset, 1000 * 60 * 4);

    reset();

    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      keyboardListener.remove();
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const fetchPendingForms = async () => {
      const storedPendingForms = await AsyncStorage.getItem("pending_forms");
      setPendingForms(storedPendingForms ? JSON.parse(storedPendingForms) : []);
    };

    fetchPendingForms();
  }, []);

  // Corrige: elimina cualquier referencia a setPendingSync (no existe ni es necesaria)
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected);
      // No uses setPendingSync aquí, simplemente actualiza isOnline
    });
    return () => unsubscribe();
  }, [pendingForms]);

  const handleSubmitPendingForm = async (form, tokenOverride = null) => {
    try {
      const token = tokenOverride || (await AsyncStorage.getItem("authToken"));
      if (!token) throw new Error("No authentication token found");

      const requestOptions = {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      };

      // Cargar seriales offline si existen
      let fileSerials = {};
      try {
        const serialsRaw = await AsyncStorage.getItem("file_serials_offline");
        if (serialsRaw) fileSerials = JSON.parse(serialsRaw);
      } catch {}

      const saveResponseRes = await fetch(
        `https://api-forms.sfisas.com.co/responses/save-response/${form.id}?mode=offline`,
        {
          method: "POST",
          headers: requestOptions.headers,
        }
      );

      const saveResponseData = await saveResponseRes.json();
      const responseId = saveResponseData.response_id;

      for (const response of form.responses) {
        // Enviar la respuesta
        const answerRes = await fetch(
          `https://api-forms.sfisas.com.co/responses/save-answers`,
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
        const answerJson = await answerRes.json();

        // Si es archivo y hay serial offline, asociar el serial al answer_id devuelto
        if (
          response.file_path &&
          fileSerials &&
          fileSerials[response.question_id] &&
          answerJson &&
          answerJson.answer &&
          answerJson.answer.answer_id
        ) {
          try {
            const serialPayload = {
              answer_id: answerJson.answer.answer_id,
              serial: fileSerials[response.question_id],
            };
            await fetch(
              "https://api-forms.sfisas.com.co/responses/file-serials/",
              {
                method: "POST",
                headers: requestOptions.headers,
                body: JSON.stringify(serialPayload),
              }
            );
          } catch (serialErr) {
            console.error(
              "❌ Error asociando serial offline al answer:",
              serialErr
            );
          }
        }
      }

      console.log(`✅ Formulario ID ${form.id} enviado correctamente.`);
    } catch (error) {
      console.error(`❌ Error al enviar formulario ID ${form.id}:`, error);
      throw error;
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.header}>Formularios Pendientes</Text>
        {pendingForms.length === 0 ? (
          <Text style={styles.noPendingText}>
            No hay formularios en estado offline pendientes.
          </Text>
        ) : (
          pendingForms.map((form, index) => (
            <View key={index} style={styles.formItem}>
              <Text style={styles.formText}>Formulario ID: {form.id}</Text>
              <TouchableOpacity
                style={styles.submitButton}
                onPress={async () => {
                  try {
                    await handleSubmitPendingForm(form);
                    // Elimina el formulario de la lista local
                    const updatedPendingForms = pendingForms.filter(
                      (f) => f.id !== form.id
                    );
                    setPendingForms(updatedPendingForms);
                    await AsyncStorage.setItem(
                      "pending_forms",
                      JSON.stringify(updatedPendingForms)
                    );
                    Alert.alert(
                      "Sincronización",
                      "Formulario enviado correctamente."
                    );
                  } catch (error) {
                    Alert.alert(
                      "Error",
                      `No se pudo sincronizar el formulario ID ${form.id}`
                    );
                  }
                }}
                disabled={!isOnline}
              >
                <Text style={styles.submitButtonText}>
                  {isOnline ? "Enviar" : "Sin conexión"}
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.push("/home")}
        >
          <Text style={styles.backButtonText}>
            <HomeIcon color={"white"} />
            {"  "}
            Home
          </Text>
        </TouchableOpacity>
      </ScrollView>
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Sesión cerrada por inactividad
            </Text>
            <Text style={styles.modalText}>
              Por seguridad, la sesión se cerró automáticamente tras 8 minutos
              sin actividad.
            </Text>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: "#2563eb" }]}
              onPress={() => {
                setShowLogoutModal(false);
                router.push("/");
              }}
            >
              <Text style={styles.modalButtonText}>Ir al inicio de sesión</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: width * 0.05, backgroundColor: "#ffffff" },
  header: {
    fontSize: width * 0.06,
    fontWeight: "bold",
    marginBottom: height * 0.02,
  },
  noPendingText: {
    fontSize: width * 0.045,
    color: "#555",
    textAlign: "center",
  },
  formItem: {
    padding: width * 0.04,
    backgroundColor: "#f0f0f0",
    borderRadius: width * 0.02,
    marginBottom: height * 0.02,
  },
  formText: { fontSize: width * 0.05, fontWeight: "bold" },
  submitButton: {
    marginTop: height * 0.01,
    padding: height * 0.02,
    backgroundColor: "#2563eb",
    borderRadius: width * 0.02,
    alignItems: "center",
  },
  submitButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045,
  },
  backButton: {
    marginTop: height * 0.03,
    padding: height * 0.02,
    backgroundColor: "blue",
    borderRadius: width * 0.02,
    alignItems: "center",
  },
  backButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    width: "80%",
    backgroundColor: "white",
    borderRadius: 10,
    padding: 20,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  modalText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  modalInput: {
    width: "100%",
    padding: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    marginBottom: 20,
  },
  modalButton: {
    flex: 1,
    padding: 10,
    borderRadius: 5,
    alignItems: "center",
    marginHorizontal: 5,
  },
  modalButtonText: {
    color: "white",
    fontWeight: "bold",
  },
});
