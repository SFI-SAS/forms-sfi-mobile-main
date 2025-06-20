import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  BackHandler,
  Modal,
  Dimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { HomeIcon } from "./Icons";
import { LinearGradient } from "expo-linear-gradient";

const { width, height } = Dimensions.get("window");

const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutos

export default function MyForms() {
  const [submittedForms, setSubmittedForms] = useState([]);
  const [responsesByForm, setResponsesByForm] = useState({});
  const [expandedForms, setExpandedForms] = useState({});
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const inactivityTimer = useRef(null);
  const router = useRouter();

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
    handleViewForms();
  }, []);

  // Cargar formularios enviados y sus respuestas (offline primero, si no online)
  const handleViewForms = async () => {
    try {
      const accessToken = await AsyncStorage.getItem("authToken");
      if (!accessToken) {
        console.error("Error: No hay token de acceso disponible.");
        return;
      }

      // Obtener formularios enviados
      const response = await fetch(
        `https://api-forms-sfi.service.saferut.com/forms/users/completed_forms`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (!response.ok)
        throw new Error("Error al cargar formularios enviados.");
      const data = await response.json();
      setSubmittedForms(data || []);

      // Obtener respuestas por formulario desde AsyncStorage (offline)
      if (Array.isArray(data) && data.length > 0) {
        const responsesObj = {};
        for (const form of data) {
          const key = `completed_form_answers_${form.id}`;
          try {
            const stored = await AsyncStorage.getItem(key);
            if (stored) {
              responsesObj[form.id] = JSON.parse(stored);
            } else {
              // Si no hay en memoria, intenta online (opcional)
              responsesObj[form.id] = [];
            }
          } catch {
            responsesObj[form.id] = [];
          }
        }
        setResponsesByForm(responsesObj);
      }
    } catch (error) {
      console.error("❌ Error al cargar formularios enviados:", error);
      Alert.alert("Error", "No se pudieron cargar los formularios enviados.");
    }
  };

  // Alternar visualización de respuestas por formulario
  const toggleExpand = (formId) => {
    setExpandedForms((prev) => ({
      ...prev,
      [formId]: !prev[formId],
    }));
  };

  // --- Inactividad: logout automático ---
  const resetInactivityTimer = async () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(async () => {
      await AsyncStorage.setItem("isLoggedOut", "true");
      await AsyncStorage.removeItem("authToken");
      setShowLogoutModal(true);
    }, INACTIVITY_TIMEOUT);
  };

  useEffect(() => {
    const reset = () => resetInactivityTimer();
    const touchListener = () => reset();
    const focusListener = () => reset();

    // React Native events
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      reset
    );
    const interval = setInterval(reset, 1000 * 60 * 4);

    reset();

    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      subscription.remove();
      clearInterval(interval);
    };
  }, []);

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
            <Text style={styles.header}>Formularios Enviados</Text>
            {submittedForms.length === 0 ? (
              <Text style={styles.noFormsText}>
                No hay formularios enviados disponibles.
              </Text>
            ) : (
              submittedForms.map((form, index) => (
                <View key={form.id} style={styles.formCardWrapper}>
                  <View style={styles.formCard}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.formText}>
                          Formulario ID: {form.id}
                        </Text>
                        <Text style={styles.formDescription}>
                          Título: {form.title || "Sin título"}
                        </Text>
                        <Text
                          style={[
                            styles.formMode,
                            form.mode === "offline"
                              ? styles.formModeOffline
                              : styles.formModeOnline,
                          ]}
                        >
                          {form.mode === "offline"
                            ? "Enviado Offline"
                            : "Enviado Online"}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.viewResponsesButton}
                        onPress={() => toggleExpand(form.id)}
                      >
                        <Text style={styles.viewResponsesButtonText}>
                          {expandedForms[form.id]
                            ? "Ocultar respuestas"
                            : "Ver respuestas"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {expandedForms[form.id] && (
                      <View style={styles.responsesContainer}>
                        {Array.isArray(responsesByForm[form.id]) &&
                        responsesByForm[form.id].length > 0 ? (
                          responsesByForm[form.id].map((dilig, idx) => (
                            <View key={idx} style={styles.diligCard}>
                              <Text style={styles.diligHeader}>
                                Diligenciamiento #{idx + 1}
                              </Text>
                              <Text style={styles.diligMeta}>
                                Fecha: {dilig.submission_date || "Desconocida"}{" "}
                                - Hora: {dilig.submission_time || "Desconocida"}
                              </Text>
                              <Text
                                style={[
                                  styles.formMode,
                                  dilig.mode === "offline"
                                    ? styles.formModeOffline
                                    : styles.formModeOnline,
                                ]}
                              >
                                {dilig.mode === "offline"
                                  ? "Offline"
                                  : "Online"}
                              </Text>
                              {Array.isArray(dilig.answers) &&
                              dilig.answers.length > 0 ? (
                                dilig.answers.map((ans, i) => (
                                  <View key={i} style={styles.answerRow}>
                                    <Text style={styles.answerQuestion}>
                                      {ans.question_text}:
                                    </Text>
                                    <Text style={styles.answerValue}>
                                      {ans.answer_text || ans.file_path || "-"}
                                    </Text>
                                  </View>
                                ))
                              ) : (
                                <Text style={styles.noAnswersText}>
                                  Sin respuestas.
                                </Text>
                              )}
                            </View>
                          ))
                        ) : (
                          <Text style={styles.noAnswersText}>
                            No hay respuestas para este formulario.
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
        {/* Modal de cierre de sesión por inactividad */}
        <Modal
          visible={showLogoutModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowLogoutModal(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.4)",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: 10,
                padding: 24,
                width: "80%",
                alignItems: "center",
                elevation: 5,
              }}
            >
              <Text
                style={{
                  fontWeight: "bold",
                  fontSize: 20,
                  marginBottom: 8,
                  color: "#222",
                }}
              >
                Sesión cerrada por inactividad
              </Text>
              <Text
                style={{
                  fontSize: 16,
                  color: "#444",
                  marginBottom: 12,
                  textAlign: "center",
                }}
              >
                Por seguridad, la sesión se cerró automáticamente tras 2 minutos
                sin actividad.
              </Text>
              <TouchableOpacity
                style={{
                  backgroundColor: "#2563eb",
                  borderRadius: 6,
                  padding: 12,
                  alignItems: "center",
                  width: "100%",
                }}
                onPress={() => {
                  setShowLogoutModal(false);
                  router.replace("/");
                }}
              >
                <Text
                  style={{ color: "white", fontWeight: "bold", fontSize: 18 }}
                >
                  Ir al inicio de sesión
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f7fafc" },
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
  noFormsText: {
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
    // Espacio en todos los bordes respecto al padre
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
    // Sombra ya está en el wrapper
  },
  formText: {
    fontSize: width * 0.05,
    fontWeight: "bold",
    color: "#12A0AF",
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  formDescription: {
    fontSize: width * 0.04,
    color: "#4B34C7",
    marginBottom: 4,
    fontStyle: "italic",
  },
  formMode: {
    fontSize: 13,
    fontWeight: "bold",
    marginTop: 2,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "flex-start",
    overflow: "hidden",
  },
  formModeOnline: {
    color: "#fff",
    backgroundColor: "#12A0AF",
  },
  formModeOffline: {
    color: "#fff",
    backgroundColor: "#EB9525FF",
  },
  viewResponsesButton: {
    backgroundColor: "#4B34C7",
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginLeft: 8,
    alignSelf: "flex-start",
    shadowColor: "#12A0AF",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  viewResponsesButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 13,
    letterSpacing: 0.2,
  },
  responsesContainer: {
    marginTop: 10,
    backgroundColor: "#e6fafd",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#12A0AF44",
  },
  diligCard: {
    backgroundColor: "#fff",
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
    borderColor: "#12A0AF",
    borderWidth: 1,
    shadowColor: "#4B34C7",
    shadowOpacity: 0.07,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  diligHeader: {
    fontWeight: "bold",
    fontSize: 15,
    marginBottom: 2,
    color: "#4B34C7",
  },
  diligMeta: {
    fontSize: 13,
    color: "#12A0AF",
    marginBottom: 2,
  },
  answerRow: {
    flexDirection: "row",
    marginBottom: 2,
    flexWrap: "wrap",
  },
  answerQuestion: {
    fontWeight: "bold",
    fontSize: 13,
    color: "#4B34C7",
    marginRight: 4,
    flexShrink: 1,
    maxWidth: "50%",
  },
  answerValue: {
    fontSize: 13,
    color: "#222",
    flex: 1,
    flexWrap: "wrap",
  },
  noAnswersText: {
    fontSize: 13,
    color: "#888",
    fontStyle: "italic",
    marginVertical: 4,
  },
});
