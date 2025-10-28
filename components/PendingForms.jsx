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
  Keyboard,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
// import { HomeIcon } from "./Icons"; // Se asume que este ícono ya no es necesario en esta pantalla.
// import { LinearGradient } from "expo-linear-gradient"; // Se elimina, usando un fondo plano.

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
        console.log(
          "🔒 No hay token al cargar PendingForms. Redirigiendo al login..."
        );
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

        // Unifica formularios pendientes desde la cola unificada y las claves legacy
        const storedPendingForms = await AsyncStorage.getItem("pending_forms");
        const unifiedQueue = storedPendingForms
          ? JSON.parse(storedPendingForms)
          : [];
        const storedPendingSaveResponse = await AsyncStorage.getItem(
          PENDING_SAVE_RESPONSE_KEY
        );
        const pendingSaveResponse = storedPendingSaveResponse
          ? JSON.parse(storedPendingSaveResponse)
          : [];

        // Construir listado único {id, title, description}
        const idsUnified = (unifiedQueue || []).map((f) => f.id);

        // Intenta obtener title y description de metadata offline
        const storedMeta = await AsyncStorage.getItem("offline_forms_metadata");
        const metaObj = storedMeta ? JSON.parse(storedMeta) : {};

        const unified = [
          ...(unifiedQueue || []).map((f) => ({
            id: f.id,
            title: (metaObj && metaObj[f.id] && metaObj[f.id].title) || "",
            description:
              (metaObj && metaObj[f.id] && metaObj[f.id].description) || "",
          })),
          ...pendingSaveResponse
            .filter((f) => !idsUnified.includes(f.form_id))
            .map((f) => ({
              id: f.form_id,
              title:
                (metaObj && metaObj[f.form_id] && metaObj[f.form_id].title) ||
                "",
              description:
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
            // Busca en la cola unificada pending_forms (nuevo esquema)
            const queueItem = (unifiedQueue || []).find(
              (f) => String(f.id) === String(form.id)
            );
            if (queueItem && Array.isArray(queueItem.answersFull)) {
              answersObj[form.id] = queueItem.answersFull;
            } else {
              answersObj[form.id] = [];
            }
          }
          // Construir el mapa de question_id -> question_text para este formulario
          if (offlineQuestions[form.id]) {
            const qMap = {};
            const raw = offlineQuestions[form.id];
            // Admite array plano o { questions } o { questions: [], form_design: ... }
            const qArr = Array.isArray(raw)
              ? raw
              : Array.isArray(raw?.questions)
                ? raw.questions
                : [];
            (qArr || []).forEach((q) => {
              if (q && q.id !== undefined) {
                qMap[q.id] = q.question_text || q.text || "";
              }
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

      // 1. Intentar usar la cola unificada primero
      const storedPendingForms = await AsyncStorage.getItem("pending_forms");
      const unifiedQueue = storedPendingForms
        ? JSON.parse(storedPendingForms)
        : [];
      const queueItem = (unifiedQueue || []).find(
        (f) => String(f.id) === String(form.id)
      );

      let responseId = null;
      if (queueItem) {
        // save-response (crea response_id)
        const saveResponseRes = await fetch(
          `${backendUrl}/responses/save-response/${form.id}?action=send_and_close`,
          {
            method: "POST",
            headers: requestOptions.headers,
            body: JSON.stringify(queueItem.answersForApi || []),
          }
        );
        if (saveResponseRes.status === 401)
          throw new Error("Unauthorized - Token inválido");
        const saveResponseJson = await saveResponseRes.json();
        responseId = saveResponseJson.response_id;

        // save-answers secuencial
        if (responseId && Array.isArray(queueItem.answersFull)) {
          for (const answer of queueItem.answersFull) {
            const isFile =
              answer.question_type === "file" || !!answer.file_path;
            const answerRes = await fetch(
              `${backendUrl}/responses/save-answers/?action=send_and_close`,
              {
                method: "POST",
                headers: requestOptions.headers,
                body: JSON.stringify({
                  response_id: responseId,
                  question_id: answer.question_id,
                  answer_text: isFile ? "" : answer.answer_text,
                  file_path: answer.file_path || "",
                }),
              }
            );
            if (answerRes.status === 401)
              throw new Error("Unauthorized - Token inválido");
            const resJson = await answerRes.json();
            // asociar serial si aplica
            if (
              isFile &&
              queueItem.fileSerials &&
              queueItem.fileSerials[answer.question_id] &&
              resJson?.answer?.answer_id
            ) {
              try {
                await fetch(`${backendUrl}/responses/file-serials/`, {
                  method: "POST",
                  headers: requestOptions.headers,
                  body: JSON.stringify({
                    answer_id: resJson.answer.answer_id,
                    serial: queueItem.fileSerials[answer.question_id],
                  }),
                });
              } catch {}
            }
          }
        }

        // Quitar item de la cola y del estado local
        const remaining = (unifiedQueue || []).filter(
          (f) => String(f.id) !== String(form.id)
        );
        await AsyncStorage.setItem("pending_forms", JSON.stringify(remaining));
        setPendingForms((prev) =>
          prev.filter((f) => String(f.id) !== String(form.id))
        );
      } else {
        // 2. Fallback legacy (pending_save_*), por compatibilidad
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

        if (saveResponseData) {
          const saveResponseRes = await fetch(
            `${backendUrl}/responses/save-response/${form.id}?mode=offline&action=send_and_close`,
            {
              method: "POST",
              headers: requestOptions.headers,
              body: JSON.stringify(saveResponseData.answers || []),
            }
          );
          if (saveResponseRes.status === 401)
            throw new Error("Unauthorized - Token inválido");
          const saveResponseJson = await saveResponseRes.json();
          responseId = saveResponseJson.response_id;
        }
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
            if (answerRes.status === 401)
              throw new Error("Unauthorized - Token inválido");
          }
        }

        const newPendingSaveResponse = (await AsyncStorage.getItem(
          PENDING_SAVE_RESPONSE_KEY
        ))
          ? JSON.parse(
              await AsyncStorage.getItem(PENDING_SAVE_RESPONSE_KEY)
            ).filter((r) => String(r.form_id) !== String(form.id))
          : [];
        await AsyncStorage.setItem(
          PENDING_SAVE_RESPONSE_KEY,
          JSON.stringify(newPendingSaveResponse)
        );
        const newPendingSaveAnswers = (await AsyncStorage.getItem(
          PENDING_SAVE_ANSWERS_KEY
        ))
          ? JSON.parse(
              await AsyncStorage.getItem(PENDING_SAVE_ANSWERS_KEY)
            ).filter((a) => String(a.form_id) !== String(form.id))
          : [];
        await AsyncStorage.setItem(
          PENDING_SAVE_ANSWERS_KEY,
          JSON.stringify(newPendingSaveAnswers)
        );
        setPendingForms((prev) =>
          prev.filter((f) => String(f.id) !== String(form.id))
        );
      }

      console.log(
        "[DEBUG][OFFLINE] Envío manual completado para formulario",
        form.id
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
    // Se elimina LinearGradient y se usa un fondo corporativo (blanco/gris claro)
    <View style={styles.baseContainer}>
      <View style={styles.contentWrapper}>
        <View style={styles.headerBar}>
          {/* Se usa el color primario para el encabezado */}
          <Text style={styles.header}>Sincronización Pendiente</Text>
        </View>

        <ScrollView
          style={styles.formsScrollView}
          contentContainerStyle={styles.formsContentContainer}
          showsVerticalScrollIndicator={false}
        >
          {pendingForms.length === 0 ? (
            <View style={styles.noPendingBox}>
              <Text style={styles.noPendingText}>
                No hay formularios pendientes de sincronización. ✨
              </Text>
            </View>
          ) : (
            pendingForms.map((form, index) => (
              <View key={index} style={styles.formCardWrapper}>
                <View style={styles.formCard}>
                  <View style={styles.formHeader}>
                    {/* Título más destacado con color primario */}
                    <Text style={styles.formTitle}>
                      {form.title || `Formulario sin título`}
                    </Text>
                    {/* ID como texto secundario */}
                    <Text style={styles.formIdText}>ID: {form.id}</Text>
                  </View>

                  {form.description ? (
                    <Text style={styles.formDescription}>
                      **Descripción:** {form.description}
                    </Text>
                  ) : null}

                  {/* Botón para mostrar/ocultar respuestas: estilo secundario */}
                  <TouchableOpacity
                    style={styles.toggleButton}
                    onPress={() =>
                      setShowAnswers((prev) => ({
                        ...prev,
                        [form.id]: !prev[form.id],
                      }))
                    }
                  >
                    <Text style={styles.toggleButtonText}>
                      {showAnswers[form.id]
                        ? "Ocultar Respuestas (▲)"
                        : "Ver Respuestas (▼)"}
                    </Text>
                  </TouchableOpacity>

                  {/* Mostrar respuestas si está expandido */}
                  {showAnswers[form.id] && (
                    <View style={styles.answersContainer}>
                      {Array.isArray(answersByForm[form.id]) &&
                      answersByForm[form.id].length > 0 ? (
                        answersByForm[form.id].map((ans, i) => (
                          <View key={i} style={styles.answerItem}>
                            <Text style={styles.answerQuestion}>
                              **Pregunta:**{" "}
                              {questionsByForm[form.id]?.[ans.question_id] ||
                                ans.question_text ||
                                `ID ${ans.question_id}`}
                            </Text>
                            <Text style={styles.answerText}>
                              **Respuesta:**{" "}
                              {ans.answer_text ||
                                ans.response ||
                                ans.file_path ||
                                "Sin respuesta registrada."}
                            </Text>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.noAnswersText}>
                          No hay respuestas detalladas guardadas.
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Botón de Sincronización: estilo primario */}
                  <TouchableOpacity
                    style={[
                      styles.syncButton,
                      !isOnline && styles.offlineSyncButton,
                      loading && { opacity: 0.7 }, // Opacidad al cargar
                    ]}
                    onPress={async () => {
                      try {
                        await handleSubmitPendingForm(form);
                      } catch (error) {
                        console.error(
                          "❌ Error al presionar botón enviar:",
                          error
                        );
                        await handleAuthError(error);
                      }
                    }}
                    disabled={!isOnline || loading}
                  >
                    <Text style={styles.syncButtonText}>
                      {loading
                        ? "ENVIANDO..."
                        : isOnline
                          ? "SINCRONIZAR AHORA"
                          : "SIN CONEXIÓN"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </View>

      {/* Modal de Cierre de Sesión (ajustando colores a la paleta) */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Sesión Cerrada por Inactividad
            </Text>
            <Text style={styles.modalText}>
              Por seguridad, tu sesión se cerró automáticamente después de 10
              minutos.
            </Text>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: "#4B34C7" }]}
              onPress={() => {
                setShowLogoutModal(false);
                router.replace("/");
              }}
            >
              <Text style={styles.modalButtonText}>Ir a Iniciar Sesión</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---
// Estilos Empresariales y Optimizados
// ---

const styles = StyleSheet.create({
  // Colores Base
  COLOR_PRIMARY: "#4B34C7", // Morado/Azul Oscuro
  COLOR_SECONDARY: "#12A0AF", // Cian/Azul Verdoso
  COLOR_BACKGROUND: "#F5F7FA", // Gris muy claro
  COLOR_TEXT_DARK: "#2C3E50", // Gris Oscuro para mejor lectura
  COLOR_DANGER: "#E74C3C", // Rojo (para "sin conexión")

  // Contenedor principal
  baseContainer: {
    flex: 1,
    backgroundColor: "#F5F7FA", // Fondo gris muy claro para un look profesional
  },
  contentWrapper: {
    flex: 1,
    backgroundColor: "#FFFFFF", // Caja principal blanca
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 16,
    borderRadius: 12,
    // Sombra sutil para un efecto elevado
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 5,
  },

  // Encabezado
  headerBar: {
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#EAECEF", // Separador sutil
    paddingHorizontal: 20,
  },
  header: {
    fontSize: 22,
    fontWeight: "700",
    color: "#4B34C7", // Color primario para el título
    textAlign: "left",
    letterSpacing: 0.5,
  },

  // ScrollView y Listado
  formsScrollView: {
    flex: 1,
  },
  formsContentContainer: {
    padding: 16,
  },
  noPendingBox: {
    backgroundColor: "#E6F7F7", // Fondo sutil con color secundario
    padding: 20,
    borderRadius: 8,
    marginTop: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#12A0AF",
  },
  noPendingText: {
    fontSize: 16,
    color: "#12A0AF",
    textAlign: "center",
    fontStyle: "italic",
  },

  // Tarjeta de Formulario
  formCardWrapper: {
    marginBottom: 16,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    // Sombra más pequeña para cada tarjeta
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#EAECEF",
  },
  formCard: {
    padding: 16,
    borderRadius: 10,
  },
  formHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6", // Separador
    paddingBottom: 8,
  },
  formTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "bold",
    color: "#4B34C7", // Color primario
    marginRight: 10,
  },
  formIdText: {
    fontSize: 14,
    color: "#607D8B", // Gris neutro para información secundaria
    fontWeight: "500",
  },
  formDescription: {
    fontSize: 14,
    color: "#4B34C7",
    marginBottom: 10,
    lineHeight: 20,
  },

  // Botón Ver/Ocultar
  toggleButton: {
    marginTop: 10,
    marginBottom: 10,
    alignSelf: "flex-start",
    backgroundColor: "#E6F7F7", // Fondo muy claro de color secundario
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#12A0AF",
  },
  toggleButtonText: {
    color: "#12A0AF", // Texto con color secundario
    fontWeight: "600",
    fontSize: 13,
  },

  // Contenedor de Respuestas
  answersContainer: {
    backgroundColor: "#F9FAFB", // Fondo muy claro para diferenciar el área de respuestas
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#EAECEF",
  },
  answerItem: {
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#EAECEF",
  },
  answerQuestion: {
    color: "#4B34C7", // Pregunta con color primario
    fontWeight: "600",
    fontSize: 14,
  },
  answerText: {
    color: "#2C3E50", // Respuesta con color de texto oscuro
    fontSize: 14,
    marginTop: 2,
  },
  noAnswersText: {
    color: "#888",
    fontStyle: "italic",
    textAlign: "center",
  },

  // Botones de Sincronización
  syncButton: {
    marginTop: 10,
    paddingVertical: 14,
    backgroundColor: "#12A0AF", // Color Secundario para acción positiva
    borderRadius: 8,
    alignItems: "center",
    // Sombra que resalta la acción
    shadowColor: "#12A0AF",
    shadowOpacity: 0.2,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  offlineSyncButton: {
    backgroundColor: "#E74C3C", // Rojo para indicar falta de conexión/alerta
    shadowColor: "#E74C3C",
    shadowOpacity: 0.2,
  },
  syncButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
    letterSpacing: 0.5,
  },

  // Estilos del Modal (Ajustados ligeramente)
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.4)", // Fondo oscuro y semi-transparente
  },
  modalContent: {
    width: "85%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
    color: "#4B34C7",
    textAlign: "center",
  },
  modalText: {
    fontSize: 15,
    textAlign: "center",
    marginBottom: 20,
    color: "#607D8B",
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#4B34C7", // Usando el color Primario
    marginTop: 10,
  },
  modalButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
});
