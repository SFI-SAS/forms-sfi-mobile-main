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
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

const { width, height } = Dimensions.get("window");
const RESPONSES_OFFLINE_KEY = "responses_with_answers_offline";
const RESPONSES_DETAIL_OFFLINE_KEY = "responses_detail_offline"; // NUEVO

export default function MyForms() {
  const [forms, setForms] = useState([]);
  const [expandedForms, setExpandedForms] = useState({});
  const [responsesByForm, setResponsesByForm] = useState({});
  const [responsesDetail, setResponsesDetail] = useState({}); // { [formId]: [responses] }
  const [loading, setLoading] = useState(true);
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
    setLoading(true);
    try {
      const accessToken = await AsyncStorage.getItem("authToken");
      if (!accessToken) {
        setLoading(false);
        return;
      }

      // 1. Obtener la lista de formularios asignados al usuario
      const formsRes = await fetch(
        "https://api-forms-sfi.service.saferut.com/forms/users/form_by_user",
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      const formsData = await formsRes.json();
      if (!Array.isArray(formsData)) {
        setForms([]);
        setResponsesByForm({});
        setLoading(false);
        Alert.alert(
          "Error",
          "No se pudieron cargar los formularios asignados."
        );
        return;
      }

      // 2. Para cada formulario, obtener sus respuestas (si existen)
      const grouped = {};
      const formsList = [];
      for (const form of formsData) {
        try {
          const res = await fetch(
            `https://api-forms-sfi.service.saferut.com/responses/get_responses/?form_id=${form.id}`,
            {
              method: "GET",
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );
          const responses = await res.json();
          // Solo agrega el formulario si tiene respuestas
          if (Array.isArray(responses) && responses.length > 0) {
            grouped[form.id] = responses;
            formsList.push({
              id: form.id,
              form_title: form.title || "Sin título",
              form_description: form.description || "",
              submitted_by: responses[0]?.submitted_by || {},
            });
          }
        } catch (e) {
          // Si falla la consulta de respuestas, ignora ese formulario
        }
      }

      setResponsesByForm(grouped);
      setForms(formsList);

      // DEBUG: Mostrar forms y grouped en el state
      setTimeout(() => {
        console.log("📋 State forms:", formsList);
        console.log("📋 State grouped:", grouped);
      }, 1000);

      // NUEVO: Cargar detalles de respuestas por form_id usando el endpoint correcto
      const detailStored = await AsyncStorage.getItem(
        RESPONSES_DETAIL_OFFLINE_KEY
      );
      let detailData = detailStored ? JSON.parse(detailStored) : {};

      for (const form of formsList) {
        if (!detailData[form.id]) {
          try {
            // Usa el endpoint con query param form_id
            const res = await fetch(
              `https://api-forms-sfi.service.saferut.com/responses/get_responses/?form_id=${form.id}`,
              {
                method: "GET",
                headers: { Authorization: `Bearer ${accessToken}` },
              }
            );
            const detailResp = await res.json();
            if (Array.isArray(detailResp)) {
              detailData[form.id] = detailResp;
            }
          } catch (e) {
            // Si falla online, ignora y sigue
          }
        }
      }
      setResponsesDetail(detailData);
      await AsyncStorage.setItem(
        RESPONSES_DETAIL_OFFLINE_KEY,
        JSON.stringify(detailData)
      );
    } catch (error) {
      console.error("❌ Error al cargar formularios enviados:", error);
      setForms([]);
      setResponsesByForm({});
      Alert.alert("Error", "No se pudieron cargar los formularios enviados.");
    } finally {
      setLoading(false);
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
    inactivityTimer.current = setTimeout(
      async () => {
        await AsyncStorage.setItem("isLoggedOut", "true");
        await AsyncStorage.removeItem("authToken");
        setShowLogoutModal(true);
      },
      10 * 60 * 1000
    );
  };

  useEffect(() => {
    const reset = () => resetInactivityTimer();
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
              minHeight: height * 0.7, // Asegura espacio para contenido
            }}
            showsVerticalScrollIndicator={true}
          >
            <Text style={styles.header}>Formularios Enviados</Text>
            {loading ? (
              <ActivityIndicator size="large" color="#12A0AF" />
            ) : forms.length === 0 ? (
              <Text style={styles.noFormsText}>
                No hay formularios enviados disponibles.
              </Text>
            ) : (
              forms.map((form, index) => (
                <View key={form.id} style={styles.formCardWrapper}>
                  <View style={styles.formCard}>
                    <Text
                      style={styles.formText}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      Formulario ID: {form.id}
                    </Text>
                    <Text
                      style={styles.formTitle}
                      numberOfLines={2}
                      ellipsizeMode="tail"
                    >
                      {form.form_title || "Sin título"}
                    </Text>
                    <Text
                      style={styles.formDescription}
                      numberOfLines={2}
                      ellipsizeMode="tail"
                    >
                      {form.form_description || ""}
                    </Text>
                    <Text style={styles.formMeta} numberOfLines={1}>
                      Respondido por: {form.submitted_by?.name || "-"}
                    </Text>
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
                    {expandedForms[form.id] && (
                      <View style={styles.responsesContainer}>
                        <ScrollView
                          style={{ maxHeight: height * 0.35 }}
                          contentContainerStyle={{ paddingBottom: 8 }}
                          nestedScrollEnabled
                          showsVerticalScrollIndicator={true}
                        >
                          {Array.isArray(responsesByForm[form.id]) &&
                          responsesByForm[form.id].length > 0 ? (
                            responsesByForm[form.id].map((resp, idx) => (
                              <View
                                key={resp.response_id || idx}
                                style={styles.diligCard}
                              >
                                <Text
                                  style={styles.diligHeader}
                                  numberOfLines={1}
                                  ellipsizeMode="tail"
                                >
                                  Diligenciamiento #{idx + 1}
                                </Text>
                                <Text
                                  style={styles.diligMeta}
                                  numberOfLines={1}
                                >
                                  Fecha: {resp.submitted_at || "Desconocida"}
                                </Text>
                                <Text
                                  style={styles.diligMeta}
                                  numberOfLines={1}
                                >
                                  Estado de aprobación:{" "}
                                  <Text
                                    style={{
                                      color:
                                        resp.approval_status === "aprobado"
                                          ? "#22c55e"
                                          : resp.approval_status === "rechazado"
                                            ? "#ef4444"
                                            : "#fbbf24",
                                      fontWeight: "bold",
                                    }}
                                  >
                                    {resp.approval_status || "-"}
                                  </Text>
                                </Text>
                                {resp.message ? (
                                  <Text
                                    style={styles.diligMeta}
                                    numberOfLines={2}
                                    ellipsizeMode="tail"
                                  >
                                    Mensaje: {resp.message}
                                  </Text>
                                ) : null}
                                <View style={{ marginTop: 6 }}>
                                  {Array.isArray(resp.answers) &&
                                  resp.answers.length > 0 ? (
                                    <ScrollView
                                      style={{ maxHeight: height * 0.15 }}
                                      nestedScrollEnabled
                                      showsVerticalScrollIndicator={true}
                                    >
                                      {resp.answers.map((ans, i) => (
                                        <View
                                          key={i}
                                          style={{
                                            flexDirection: "row",
                                            marginBottom: 2,
                                            flexWrap: "wrap",
                                            alignItems: "flex-start",
                                          }}
                                        >
                                          <Text
                                            style={{
                                              fontWeight: "bold",
                                              color: "#4B34C7",
                                              maxWidth: width * 0.4,
                                            }}
                                            numberOfLines={1}
                                            ellipsizeMode="tail"
                                          >
                                            {ans.question_text}:
                                          </Text>
                                          <Text
                                            style={{
                                              marginLeft: 4,
                                              color: "#222",
                                              maxWidth: width * 0.45,
                                            }}
                                            numberOfLines={2}
                                            ellipsizeMode="tail"
                                          >
                                            {ans.answer_text ||
                                              ans.file_path ||
                                              "-"}
                                          </Text>
                                        </View>
                                      ))}
                                    </ScrollView>
                                  ) : (
                                    <Text style={styles.noAnswersText}>
                                      Sin respuestas.
                                    </Text>
                                  )}
                                </View>
                                {Array.isArray(resp.approvals) &&
                                  resp.approvals.length > 0 && (
                                    <View style={{ marginTop: 8 }}>
                                      <Text
                                        style={{
                                          fontWeight: "bold",
                                          color: "#2563eb",
                                        }}
                                      >
                                        Detalle de aprobaciones:
                                      </Text>
                                      <ScrollView
                                        style={{ maxHeight: height * 0.12 }}
                                        nestedScrollEnabled
                                        showsVerticalScrollIndicator={true}
                                      >
                                        {resp.approvals.map((appr, i) => (
                                          <View
                                            key={i}
                                            style={{
                                              marginBottom: 2,
                                              flexWrap: "wrap",
                                            }}
                                          >
                                            <Text style={{ color: "#222" }}>
                                              <Text
                                                style={{ fontWeight: "bold" }}
                                              >
                                                Secuencia:
                                              </Text>{" "}
                                              {appr.sequence_number} |{" "}
                                              <Text
                                                style={{ fontWeight: "bold" }}
                                              >
                                                Estado:
                                              </Text>{" "}
                                              {appr.status} |{" "}
                                              <Text
                                                style={{ fontWeight: "bold" }}
                                              >
                                                Obligatorio:
                                              </Text>{" "}
                                              {appr.is_mandatory ? "Sí" : "No"}
                                            </Text>
                                            <Text style={{ color: "#222" }}>
                                              <Text
                                                style={{ fontWeight: "bold" }}
                                              >
                                                Usuario:
                                              </Text>{" "}
                                              {appr.user?.name || "-"}
                                            </Text>
                                            {appr.message && (
                                              <Text
                                                style={{ color: "#ef4444" }}
                                              >
                                                Mensaje: {appr.message}
                                              </Text>
                                            )}
                                          </View>
                                        ))}
                                      </ScrollView>
                                    </View>
                                  )}
                                {resp.approval_status === "rechazado" && (
                                  <TouchableOpacity
                                    style={styles.reconsiderButton}
                                    onPress={() => {
                                      Alert.alert(
                                        "Reconsiderar",
                                        "Funcionalidad próximamente disponible."
                                      );
                                    }}
                                  >
                                    <Text style={styles.reconsiderButtonText}>
                                      Reconsiderar aprobación
                                    </Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            ))
                          ) : (
                            <Text style={styles.noAnswersText}>
                              No hay respuestas para este formulario.
                            </Text>
                          )}
                        </ScrollView>
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
    minHeight: height * 0.5,
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
    minWidth: width * 0.85,
    maxWidth: width * 0.95,
  },
  formCard: {
    backgroundColor: "#f7fafc",
    borderRadius: width * 0.035,
    padding: width * 0.04,
    borderWidth: 1.5,
    borderColor: "#4B34C7",
    minWidth: width * 0.8,
    maxWidth: width * 0.95,
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
  formMeta: {
    fontSize: width * 0.038,
    color: "#222",
    marginBottom: 2,
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
    marginTop: 6,
    marginBottom: 6,
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
    minHeight: 40,
    maxHeight: height * 0.4,
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
    minWidth: width * 0.7,
    maxWidth: width * 0.93,
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
  noAnswersText: {
    fontSize: 13,
    color: "#888",
    fontStyle: "italic",
    marginVertical: 4,
  },
  reconsiderButton: {
    marginTop: 10,
    backgroundColor: "#fbbf24",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 18,
    alignItems: "center",
    alignSelf: "flex-end",
  },
  reconsiderButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
});
