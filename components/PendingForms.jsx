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
const PENDING_SAVE_RESPONSE_KEY = "pending_save_response";
const PENDING_SAVE_ANSWERS_KEY = "pending_save_answers";

export default function PendingForms() {
  const [pendingForms, setPendingForms] = useState([]);
  const [isOnline, setIsOnline] = useState(false);
  const router = useRouter();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const inactivityTimer = useRef(null);

  useFocusEffect(
    React.useCallback(() => {
      const disableBack = () => true;
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        disableBack
      );
      return () => {
        subscription.remove();
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
      // Unifica los formularios pendientes de la clave legacy y los nuevos de save-response
      const storedPendingForms = await AsyncStorage.getItem("pending_forms");
      const legacyPending = storedPendingForms
        ? JSON.parse(storedPendingForms)
        : [];

      // También busca los formularios pendientes por save-response (nuevo flujo)
      const storedPendingSaveResponse = await AsyncStorage.getItem(
        PENDING_SAVE_RESPONSE_KEY
      );
      const pendingSaveResponse = storedPendingSaveResponse
        ? JSON.parse(storedPendingSaveResponse)
        : [];

      // Unifica ambos, evitando duplicados por id
      const idsLegacy = legacyPending.map((f) => f.id);

      // Solo muestra formularios que aún no han sido enviados (no duplicados)
      const unified = [
        ...legacyPending.map((f) => ({
          id: f.id,
          title: f.title || "",
          description: f.description || "",
        })),
        ...pendingSaveResponse
          .filter((f) => !idsLegacy.includes(f.form_id))
          .map((f) => ({
            id: f.form_id,
            title: f.title || "",
            description: f.description || "",
          })),
      ];

      setPendingForms(unified);

      // DEBUG: log para ver qué se está mostrando
      console.log("🟡 Formularios pendientes para mostrar:", unified);
    };

    fetchPendingForms();
  }, []);

  // Corrige: elimina cualquier referencia a setPendingSync (no existe ni es necesaria)
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // Solo actualiza el estado de conexión, NO intentes enviar formularios automáticamente
      setIsOnline(state.isConnected);
    });
    return () => unsubscribe();
  }, [pendingForms]);

  const handleSubmitPendingForm = async (form, tokenOverride = null) => {
    try {
      console.log("🟢 Botón ENVIAR presionado para formulario:", form);

      const token = tokenOverride || (await AsyncStorage.getItem("authToken"));
      if (!token) throw new Error("No authentication token found");

      const requestOptions = {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      };

      // 1. Obtener datos pendientes de save-response y save-answers para este form.id
      const storedPendingSaveResponse = await AsyncStorage.getItem(
        PENDING_SAVE_RESPONSE_KEY
      );
      const pendingSaveResponse = storedPendingSaveResponse
        ? JSON.parse(storedPendingSaveResponse)
        : [];
      const saveResponseData = pendingSaveResponse.find(
        (r) => String(r.form_id) === String(form.id)
      );

      const storedPendingSaveAnswers = await AsyncStorage.getItem(
        PENDING_SAVE_ANSWERS_KEY
      );
      const pendingSaveAnswers = storedPendingSaveAnswers
        ? JSON.parse(storedPendingSaveAnswers)
        : [];
      const saveAnswersData = pendingSaveAnswers.filter(
        (a) => String(a.form_id) === String(form.id)
      );

      // 2. Enviar save-response primero (solo para crear el response_id, modo offline)
      let responseId = null;
      if (saveResponseData) {
        const saveResponseRes = await fetch(
          `https://api-forms-sfi.service.saferut.com/responses/save-response/${form.id}?mode=offline`,
          {
            method: "POST",
            headers: requestOptions.headers,
            body: JSON.stringify(saveResponseData.answers),
          }
        );
        const saveResponseJson = await saveResponseRes.json();
        responseId = saveResponseJson.response_id;
      }

      // 3. Enviar cada respuesta individualmente a save-answers (igual que online)
      if (responseId && saveAnswersData.length > 0) {
        for (const answer of saveAnswersData) {
          // Enviar cada respuesta con el response_id generado
          const answerRes = await fetch(
            `https://api-forms-sfi.service.saferut.com/responses/save-answers/`,
            {
              method: "POST",
              headers: requestOptions.headers,
              body: JSON.stringify({
                response_id: responseId,
                question_id: answer.question_id,
                answer_text: answer.answer_text,
                file_path: answer.file_path,
              }),
            }
          );
          // Puedes agregar logs aquí si necesitas depurar
        }
      }

      // Limpieza de datos enviados
      const newPendingSaveResponse = pendingSaveResponse.filter(
        (r) => String(r.form_id) !== String(form.id)
      );
      await AsyncStorage.setItem(
        PENDING_SAVE_RESPONSE_KEY,
        JSON.stringify(newPendingSaveResponse)
      );
      const newPendingSaveAnswers = pendingSaveAnswers.filter(
        (a) => String(a.form_id) !== String(form.id)
      );
      await AsyncStorage.setItem(
        PENDING_SAVE_ANSWERS_KEY,
        JSON.stringify(newPendingSaveAnswers)
      );

      // Elimina el formulario de la lista local
      const updatedPendingForms = pendingForms.filter(
        (f) => String(f.id) !== String(form.id)
      );
      setPendingForms(updatedPendingForms);
      await AsyncStorage.setItem(
        "pending_forms",
        JSON.stringify(updatedPendingForms)
      );
      Alert.alert("Sincronización", "Formulario enviado correctamente.");
    } catch (error) {
      console.error("❌ Error en handleSubmitPendingForm:", error);
      Alert.alert(
        "Error",
        `No se pudo sincronizar el formulario ID ${form.id}`
      );
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
              {form.title ? (
                <Text style={styles.formTitle}>Título: {form.title}</Text>
              ) : null}
              {form.description ? (
                <Text style={styles.formDescription}>
                  Descripción: {form.description}
                </Text>
              ) : null}
              <TouchableOpacity
                style={styles.submitButton}
                onPress={async () => {
                  try {
                    console.log(
                      "🟢 Botón ENVIAR presionado para formulario:",
                      form
                    );
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
  formTitle: {
    fontSize: width * 0.045,
    fontWeight: "bold",
    color: "#2563eb",
    marginBottom: 2,
  },
  formDescription: {
    fontSize: width * 0.04,
    color: "#555",
    marginBottom: 4,
  },
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
