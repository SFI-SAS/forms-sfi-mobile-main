import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  BackHandler,
  Dimensions,
  Modal,
  TextInput,
  Keyboard,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { HomeIcon } from "./Icons";
import { LinearGradient } from "expo-linear-gradient";

const { width, height } = Dimensions.get("window");
const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutos
const PENDING_SAVE_RESPONSE_KEY = "pending_save_response";
const PENDING_SAVE_ANSWERS_KEY = "pending_save_answers";
const BACKEND_URL_KEY = "backend_url";

const getBackendUrl = async () => {
  const stored = await AsyncStorage.getItem(BACKEND_URL_KEY);
  return stored || "";
};

export default function PendingForms() {
  const [pendingForms, setPendingForms] = useState([]);
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAnswers, setShowAnswers] = useState({});
  const [answersByForm, setAnswersByForm] = useState({});
  const [questionsByForm, setQuestionsByForm] = useState({});
  const router = useRouter();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const inactivityTimer = useRef(null);

  // Deshabilitar botón de retroceso
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

  // Timer de inactividad
  useEffect(() => {
    const resetInactivityTimer = async () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      inactivityTimer.current = setTimeout(async () => {
        await AsyncStorage.setItem("isLoggedOut", "true");
        await AsyncStorage.removeItem("authToken");
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

  // Función para manejar errores de autenticación
  const handleAuthError = async (error) => {
    const errorMessage = error?.message || error?.toString() || "";
    
    // Detectar si es un error de autenticación
    if (
      errorMessage.includes("No authentication token") ||
      errorMessage.includes("authentication token") ||
      errorMessage.includes("Unauthorized") ||
      errorMessage.includes("401")
    ) {
      console.log("🔒 Token inválido o ausente. Cerrando sesión...");
      
      // Limpiar datos de sesión
      await AsyncStorage.setItem("isLoggedOut", "true");
      await AsyncStorage.removeItem("authToken");
      
      // Mostrar alerta y redirigir al login
      Alert.alert(
        "Sesión Expirada",
        "Tu sesión ha expirado o no es válida. Por favor, inicia sesión nuevamente.",
        [
          {
            text: "Aceptar",
            onPress: () => router.replace("/"),
          },
        ],
        { cancelable: false }
      );
      
      return true; // Indica que se manejó un error de autenticación
    }
    
    return false; // No es un error de autenticación
  };

  // Verificar token al cargar la pantalla
  useEffect(() => {
    const checkAuthToken = async () => {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        console.log("🔒 No hay token al cargar PendingForms. Redirigiendo al login...");
        Alert.alert(
          "Sesión no válida",
          "No se encontró una sesión activa. Por favor, inicia sesión.",
          [
            {
              text: "Aceptar",
              onPress: () => router.replace("/"),
            },
          ],
          { cancelable: false }
        );
      }
    };
    
    checkAuthToken();
  }, []);

  // Cargar formularios pendientes
  useEffect(() => {
    const fetchPendingForms = async () => {
      try {
        // Verificar token antes de cargar formularios
        const token = await AsyncStorage.getItem("authToken");
        if (!token) {
          console.log("🔒 No hay token disponible");
          return;
        }

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

        // Intenta obtener title y description de metadata offline
        const storedMeta = await AsyncStorage.getItem("offline_forms_metadata");
        const metaObj = storedMeta ? JSON.parse(storedMeta) : {};

        const unified = [
          ...legacyPending.map((f) => ({
            id: f.id,
            title:
              f.title || (metaObj && metaObj[f.id] && metaObj[f.id].title) || "",
            description:
              f.description ||
              (metaObj && metaObj[f.id] && metaObj[f.id].description) ||
              "",
          })),
          ...pendingSaveResponse
            .filter((f) => !idsLegacy.includes(f.form_id))
            .map((f) => ({
              id: f.form_id,
              title:
                f.title ||
                (metaObj && metaObj[f.form_id] && metaObj[f.form_id].title) ||
                "",
              description:
                f.description ||
                (metaObj &&
                  metaObj[f.form_id] &&
                  metaObj[f.form_id].description) ||
                "",
            })),
        ];

        setPendingForms(unified);

        // Cargar respuestas offline para cada formulario
        const answersObj = {};
        const questionsObj = {};
        // Cargar preguntas offline para mostrar el texto de la pregunta
        const storedQuestions = await AsyncStorage.getItem("offline_questions");
        const offlineQuestions = storedQuestions
          ? JSON.parse(storedQuestions)
          : {};

        for (const form of unified) {
          // Busca en pending_save_answers primero
          const storedPendingSaveAnswers = await AsyncStorage.getItem(
            PENDING_SAVE_ANSWERS_KEY
          );
          const pendingSaveAnswers = storedPendingSaveAnswers
            ? JSON.parse(storedPendingSaveAnswers)
            : [];
          const formAnswers = pendingSaveAnswers.filter(
            (a) => String(a.form_id) === String(form.id)
          );
          if (formAnswers.length > 0) {
            answersObj[form.id] = formAnswers;
          } else {
            // Busca en legacy pending_forms si no hay en pending_save_answers
            const storedPendingForms =
              await AsyncStorage.getItem("pending_forms");
            const legacyPending = storedPendingForms
              ? JSON.parse(storedPendingForms)
              : [];
            const legacyForm = legacyPending.find(
              (f) => String(f.id) === String(form.id)
            );
            if (legacyForm && Array.isArray(legacyForm.responses)) {
              answersObj[form.id] = legacyForm.responses;
            } else {
              answersObj[form.id] = [];
            }
          }
          // Construir el mapa de question_id -> question_text para este formulario
          if (offlineQuestions[form.id]) {
            const qMap = {};
            offlineQuestions[form.id].forEach((q) => {
              qMap[q.id] = q.question_text;
            });
            questionsObj[form.id] = qMap;
          } else {
            questionsObj[form.id] = {};
          }
        }
        setAnswersByForm(answersObj);
        setQuestionsByForm(questionsObj);
      } catch (error) {
        console.error("❌ Error al cargar formularios pendientes:", error);
        await handleAuthError(error);
      }
    };

    fetchPendingForms();
  }, []);

  // Listener de conectividad
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected);
    });
    return () => unsubscribe();
  }, [pendingForms]);

  const handleSubmitPendingForm = async (form, tokenOverride = null) => {
    setLoading(true);
    try {
      console.log("🟢 Botón ENVIAR presionado para formulario:", form);

      const token = tokenOverride || (await AsyncStorage.getItem("authToken"));
      if (!token) throw new Error("No authentication token found");
      const backendUrl = await getBackendUrl();

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
          `${backendUrl}/responses/save-response/${form.id}?mode=offline&action=send_and_close`,
          {
            method: "POST",
            headers: requestOptions.headers,
            body: JSON.stringify(saveResponseData.answers),
          }
        );
        
        // Verificar si la respuesta es 401 Unauthorized
        if (saveResponseRes.status === 401) {
          throw new Error("Unauthorized - Token inválido");
        }
        
        const saveResponseJson = await saveResponseRes.json();
        responseId = saveResponseJson.response_id;
      }

      // 3. Enviar cada respuesta individualmente a save-answers (igual que online)
      if (responseId && saveAnswersData.length > 0) {
        for (const answer of saveAnswersData) {
          const answerRes = await fetch(
            `${backendUrl}/responses/save-answers/`,
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
          
          // Verificar si la respuesta es 401 Unauthorized
          if (answerRes.status === 401) {
            throw new Error("Unauthorized - Token inválido");
          }
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
      console.log(
        "[DEBUG][OFFLINE] Actualizado pending_forms tras envío",
        updatedPendingForms
      );
      Alert.alert("Sincronización", "Formulario enviado correctamente.");
    } catch (error) {
      console.error("❌ Error en handleSubmitPendingForm:", error);
      
      // Verificar si es un error de autenticación
      const isAuthError = await handleAuthError(error);
      
      // Si no es error de autenticación, mostrar alerta genérica
      if (!isAuthError) {
        Alert.alert(
          "Error",
          `No se pudo sincronizar el formulario ID ${form.id}`
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={["#4B34C7", "#4B34C7"]} style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <View style={styles.formsScrollWrapper}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingBottom: 24,
              paddingHorizontal: 0,
            }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.header}>Offline Submitted Forms</Text>
            {pendingForms.length === 0 ? (
              <Text style={styles.noPendingText}>
                No offline forms pending.
              </Text>
            ) : (
              pendingForms.map((form, index) => (
                <View key={index} style={styles.formCardWrapper}>
                  <View style={styles.formCard}>
                    <Text style={styles.formText}>Form ID: {form.id}</Text>
                    {form.title ? (
                      <Text style={styles.formTitle}>Title: {form.title}</Text>
                    ) : null}
                    {form.description ? (
                      <Text style={styles.formDescription}>
                        Description: {form.description}
                      </Text>
                    ) : null}
                    {/* Botón para mostrar/ocultar respuestas */}
                    <TouchableOpacity
                      style={{
                        marginTop: 8,
                        marginBottom: 4,
                        alignSelf: "flex-start",
                        backgroundColor: "#4B34C7",
                        borderRadius: 6,
                        paddingVertical: 6,
                        paddingHorizontal: 14,
                      }}
                      onPress={() =>
                        setShowAnswers((prev) => ({
                          ...prev,
                          [form.id]: !prev[form.id],
                        }))
                      }
                    >
                      <Text style={{ color: "#fff", fontWeight: "bold" }}>
                        {showAnswers[form.id]
                          ? "Ocultar respuestas"
                          : "Ver respuestas"}
                      </Text>
                    </TouchableOpacity>
                    {/* Mostrar respuestas si está expandido */}
                    {showAnswers[form.id] && (
                      <View
                        style={{
                          backgroundColor: "#f3f4f6",
                          borderRadius: 8,
                          padding: 10,
                          marginBottom: 8,
                          marginTop: 2,
                        }}
                      >
                        {Array.isArray(answersByForm[form.id]) &&
                        answersByForm[form.id].length > 0 ? (
                          answersByForm[form.id].map((ans, i) => (
                            <View
                              key={i}
                              style={{
                                marginBottom: 6,
                                borderBottomWidth: 1,
                                borderBottomColor: "#e5e7eb",
                                paddingBottom: 4,
                              }}
                            >
                              <Text
                                style={{ color: "#4B34C7", fontWeight: "bold" }}
                              >
                                Pregunta:{" "}
                                {questionsByForm[form.id]?.[ans.question_id] ||
                                  ans.question_text ||
                                  ans.question_id}
                              </Text>
                              <Text style={{ color: "#222" }}>
                                Respuesta:{" "}
                                {ans.answer_text ||
                                  ans.response ||
                                  ans.file_path ||
                                  ""}
                              </Text>
                            </View>
                          ))
                        ) : (
                          <Text style={{ color: "#888" }}>
                            No hay respuestas guardadas.
                          </Text>
                        )}
                      </View>
                    )}
                    <TouchableOpacity
                      style={
                        isOnline ? styles.submitButton : styles.Offlinebutton
                      }
                      onPress={async () => {
                        try {
                          await handleSubmitPendingForm(form);
                        } catch (error) {
                          console.error("❌ Error al presionar botón enviar:", error);
                          await handleAuthError(error);
                        }
                      }}
                      disabled={!isOnline || loading}
                    >
                      <Text style={styles.submitButtonText}>
                        {loading
                          ? "Enviando..."
                          : isOnline
                            ? "Send"
                            : "No connection"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
        <Modal
          visible={showLogoutModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowLogoutModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                Session closed due to inactivity
              </Text>
              <Text style={styles.modalText}>
                For security, your session was closed automatically after 10
                minutes of inactivity.
              </Text>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: "#2563eb" }]}
                onPress={() => {
                  setShowLogoutModal(false);
                  router.replace("/");
                }}
              >
                <Text style={styles.modalButtonText}>Go to login</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: width * 0.05, backgroundColor: "#f7fafc" },
  header: {
    fontSize: width * 0.06,
    fontWeight: "bold",
    marginBottom: height * 0.02,
    color: "#4B34C7",
    textAlign: "center",
    letterSpacing: 0.5,
    textShadowColor: "#12A0AF22",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  noPendingText: {
    fontSize: width * 0.045,
    color: "#12A0AF",
    textAlign: "center",
    fontStyle: "italic",
    marginVertical: 16,
  },
  formsScrollWrapper: {
    flex: 1,
    marginHorizontal: width * 0.03,
    marginTop: 12,
    marginBottom: 0,
    borderRadius: width * 0.035,
    overflow: "hidden",
    maxHeight: height - (height * 0.07 + height * 0.1),
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#12A0AF",
    shadowColor: "#4B34C7",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  formCardWrapper: {
    marginBottom: height * 0.018,
    borderRadius: width * 0.035,
    overflow: "visible",
    shadowColor: "#12A0AF",
    shadowOpacity: 0.13,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    backgroundColor: "transparent",
    marginTop: 10,
    marginLeft: 10,
    marginRight: 10,
  },
  formCard: {
    backgroundColor: "#f7fafc",
    borderRadius: width * 0.035,
    padding: width * 0.04,
    borderWidth: 1.5,
    borderColor: "#4B34C7",
  },
  formText: {
    fontSize: width * 0.05,
    fontWeight: "bold",
    color: "#12A0AF",
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  formTitle: {
    fontSize: width * 0.045,
    fontWeight: "bold",
    color: "#4B34C7",
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  formDescription: {
    fontSize: width * 0.04,
    color: "#12A0AF",
    marginBottom: 4,
    fontStyle: "italic",
  },
  submitButton: {
    marginTop: height * 0.01,
    padding: height * 0.02,
    backgroundColor: "#12A0AF",
    borderRadius: width * 0.02,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#4B34C7",
    shadowColor: "#12A0AF",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  Offlinebutton: {
    marginTop: height * 0.01,
    padding: height * 0.02,
    backgroundColor: "#EB2525FF",
    borderRadius: width * 0.02,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#4B34C7",
    shadowColor: "#EB2525FF",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  submitButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045,
    letterSpacing: 0.2,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(18,160,175,0.13)",
  },
  modalContent: {
    width: "80%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#12A0AF",
    shadowColor: "#4B34C7",
    shadowOpacity: 0.13,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#4B34C7",
    textAlign: "center",
  },
  modalText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
    color: "#12A0AF",
  },
  modalInput: {
    width: "100%",
    padding: 10,
    borderWidth: 1,
    borderColor: "#12A0AF",
    borderRadius: 5,
    marginBottom: 20,
    backgroundColor: "#e6fafd",
  },
  modalButton: {
    flex: 1,
    padding: 10,
    borderRadius: 5,
    alignItems: "center",
    marginHorizontal: 5,
    backgroundColor: "#12A0AF",
  },
  modalButtonText: {
    color: "white",
    fontWeight: "bold",
  },
});