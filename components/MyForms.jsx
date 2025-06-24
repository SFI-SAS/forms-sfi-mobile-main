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
  TextInput,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

const { width, height } = Dimensions.get("window");
const RESPONSES_OFFLINE_KEY = "responses_with_answers_offline";
const RESPONSES_DETAIL_OFFLINE_KEY = "responses_detail_offline"; // NUEVO
const MY_FORMS_OFFLINE_KEY = "my_forms_offline"; // NUEVO

export default function MyForms() {
  const [forms, setForms] = useState([]);
  const [expandedForms, setExpandedForms] = useState({});
  const [responsesByForm, setResponsesByForm] = useState({});
  const [responsesDetail, setResponsesDetail] = useState({}); // { [formId]: [responses] }
  const [loading, setLoading] = useState(true);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [reconsiderModal, setReconsiderModal] = useState({
    visible: false,
    responseId: null,
    loading: false,
    error: null,
    message: "",
  });
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
      let formsList = [];
      let grouped = {};

      // 1. Intentar cargar de AsyncStorage primero
      const offlineDataRaw = await AsyncStorage.getItem(MY_FORMS_OFFLINE_KEY);
      let offlineData = offlineDataRaw ? JSON.parse(offlineDataRaw) : null;

      if (!accessToken && offlineData) {
        // Sin token, solo mostrar offline
        setForms(offlineData.formsList || []);
        setResponsesByForm(offlineData.grouped || {});
        setLoading(false);
        return;
      }

      // 2. Si hay token, intentar cargar online
      let onlineOk = false;
      if (accessToken) {
        try {
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
            throw new Error("No se pudieron cargar los formularios asignados.");
          }

          grouped = {};
          formsList = [];
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

          // Guardar en AsyncStorage para alta disponibilidad offline
          await AsyncStorage.setItem(
            MY_FORMS_OFFLINE_KEY,
            JSON.stringify({ formsList, grouped })
          );
          onlineOk = true;
        } catch (err) {
          // Si falla online, intenta cargar offline
          onlineOk = false;
        }
      }

      // 3. Si no se pudo cargar online, intenta cargar offline
      if (!onlineOk && offlineData) {
        setForms(offlineData.formsList || []);
        setResponsesByForm(offlineData.grouped || {});
      }
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

  // --- Nueva función para solicitar reconsideración ---
  const handleReconsider = async (responseId) => {
    setReconsiderModal({
      visible: true,
      responseId,
      loading: false,
      error: null,
      message: "",
    });
  };

  const submitReconsideration = async () => {
    setReconsiderModal((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const accessToken = await AsyncStorage.getItem("authToken");
      if (!accessToken) throw new Error("No authentication token found");
      if (!reconsiderModal.message.trim()) {
        setReconsiderModal((prev) => ({
          ...prev,
          loading: false,
          error: "Debes ingresar un mensaje de reconsideración.",
        }));
        return;
      }
      // DEBUG: log de request
      console.log("🔵 Enviando reconsideración:", {
        response_id: reconsiderModal.responseId,
        mensaje_reconsideracion: reconsiderModal.message,
      });

      // El backend espera el mensaje como parámetro de query, no en el body
      const url = `https://api-forms-sfi.service.saferut.com/responses/set_reconsideration/${reconsiderModal.responseId}?mensaje_reconsideracion=${encodeURIComponent(
        reconsiderModal.message
      )}`;

      const res = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        // body: JSON.stringify({ mensaje_reconsideracion: reconsiderModal.message }), // NO ENVIAR BODY
      });
      let data;
      try {
        data = await res.json();
      } catch (e) {
        data = {};
      }
      // DEBUG: log de respuesta
      console.log("🟢 Respuesta reconsideración:", data);

      if (!res.ok) {
        // Si el backend responde con un array de errores, muéstralo
        let msg = "No se pudo solicitar la reconsideración. Intenta de nuevo.";
        if (data?.detail) {
          if (Array.isArray(data.detail)) {
            msg =
              "Error: " +
              data.detail
                .map((d) =>
                  typeof d === "object" ? d.msg || JSON.stringify(d) : String(d)
                )
                .join(", ");
          } else if (typeof data.detail === "string") {
            msg = data.detail;
          }
        }
        throw new Error(msg);
      }

      setReconsiderModal({
        visible: false,
        responseId: null,
        loading: false,
        error: null,
        message: "",
      });
      Alert.alert(
        "Reconsideración enviada",
        "Tu solicitud de reconsideración fue enviada correctamente."
      );
      // Opcional: recargar formularios para actualizar estado
      handleViewForms();
    } catch (error) {
      console.error("❌ Error en reconsideración:", error);
      setReconsiderModal((prev) => ({
        ...prev,
        loading: false,
        error:
          error.message ||
          "No se pudo solicitar la reconsideración. Intenta de nuevo.",
      }));
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
              minHeight: height * 0.7,
            }}
            showsVerticalScrollIndicator={true}
          >
            <Text style={styles.header}>Submitted Forms</Text>
            {loading ? (
              <ActivityIndicator size="large" color="#12A0AF" />
            ) : forms.length === 0 ? (
              <Text style={styles.noFormsText}>
                No submitted forms available.
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
                      Form ID: {form.id}
                    </Text>
                    <Text
                      style={styles.formTitle}
                      numberOfLines={2}
                      ellipsizeMode="tail"
                    >
                      {form.form_title || "Untitled"}
                    </Text>
                    <Text
                      style={styles.formDescription}
                      numberOfLines={2}
                      ellipsizeMode="tail"
                    >
                      {form.form_description || ""}
                    </Text>
                    <Text style={styles.formMeta} numberOfLines={1}>
                      Submitted by: {form.submitted_by?.name || "-"}
                    </Text>
                    <TouchableOpacity
                      style={styles.viewResponsesButton}
                      onPress={() => toggleExpand(form.id)}
                    >
                      <Text style={styles.viewResponsesButtonText}>
                        {expandedForms[form.id]
                          ? "Hide responses"
                          : "Show responses"}
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
                                style={[
                                  styles.diligCard,
                                  {
                                    borderWidth: 1.5,
                                    borderColor: "#12A0AF",
                                    borderRadius: 10,
                                    marginBottom: 14,
                                    backgroundColor: "#fff",
                                    shadowColor: "#12A0AF",
                                    shadowOpacity: 0.08,
                                    shadowRadius: 4,
                                    shadowOffset: { width: 0, height: 2 },
                                    elevation: 2,
                                    padding: 14, // Add padding for space between content and border
                                  },
                                ]}
                              >
                                {/* Submission content */}
                                <Text
                                  style={styles.diligHeader}
                                  numberOfLines={1}
                                  ellipsizeMode="tail"
                                >
                                  Submission #{idx + 1}
                                </Text>
                                <Text
                                  style={styles.diligMeta}
                                  numberOfLines={1}
                                >
                                  Date: {resp.submitted_at || "Unknown"}
                                </Text>
                                <Text
                                  style={styles.diligMeta}
                                  numberOfLines={1}
                                >
                                  Approval status:{" "}
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
                                    Message: {resp.message}
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
                                      No answers.
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
                                        Approval details:
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
                                                Sequence:
                                              </Text>{" "}
                                              {appr.sequence_number} |{" "}
                                              <Text
                                                style={{ fontWeight: "bold" }}
                                              >
                                                Status:
                                              </Text>{" "}
                                              {appr.status} |{" "}
                                              <Text
                                                style={{ fontWeight: "bold" }}
                                              >
                                                Mandatory:
                                              </Text>{" "}
                                              {appr.is_mandatory ? "Yes" : "No"}
                                            </Text>
                                            <Text style={{ color: "#222" }}>
                                              <Text
                                                style={{ fontWeight: "bold" }}
                                              >
                                                User:
                                              </Text>{" "}
                                              {appr.user?.name || "-"}
                                            </Text>
                                            {appr.message && (
                                              <Text
                                                style={{ color: "#ef4444" }}
                                              >
                                                Message: {appr.message}
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
                                    onPress={() =>
                                      handleReconsider(resp.response_id)
                                    }
                                  >
                                    <Text style={styles.reconsiderButtonText}>
                                      Request reconsideration
                                    </Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            ))
                          ) : (
                            <Text style={styles.noAnswersText}>
                              No responses for this form.
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
        {/* Modal de reconsideración */}
        <Modal
          visible={reconsiderModal.visible}
          transparent
          animationType="fade"
          onRequestClose={() =>
            setReconsiderModal({
              visible: false,
              responseId: null,
              loading: false,
              error: null,
              message: "",
            })
          }
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
                width: "85%",
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
                  textAlign: "center",
                }}
              >
                Request reconsideration
              </Text>
              <Text
                style={{
                  fontSize: 15,
                  color: "#444",
                  marginBottom: 12,
                  textAlign: "center",
                }}
              >
                Write the reason for your reconsideration request for this rejected form.
              </Text>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: "#12A0AF",
                  borderRadius: 8,
                  padding: 10,
                  width: "100%",
                  minHeight: 60,
                  marginBottom: 10,
                  textAlignVertical: "top",
                }}
                multiline
                placeholder="Reason for reconsideration"
                value={reconsiderModal.message}
                onChangeText={(text) =>
                  setReconsiderModal((prev) => ({ ...prev, message: text }))
                }
                editable={!reconsiderModal.loading}
              />
              {reconsiderModal.error && (
                <Text style={{ color: "#ef4444", marginBottom: 8 }}>
                  {reconsiderModal.error}
                </Text>
              )}
              <View
                style={{
                  flexDirection: "row",
                  width: "100%",
                  justifyContent: "space-between",
                }}
              >
                <TouchableOpacity
                  style={{
                    backgroundColor: "#2563eb",
                    borderRadius: 6,
                    padding: 12,
                    alignItems: "center",
                    flex: 1,
                    marginRight: 8,
                    opacity: reconsiderModal.loading ? 0.6 : 1,
                  }}
                  onPress={submitReconsideration}
                  disabled={reconsiderModal.loading}
                >
                  <Text
                    style={{ color: "white", fontWeight: "bold", fontSize: 16 }}
                  >
                    {reconsiderModal.loading ? "Sending..." : "Send"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    backgroundColor: "#888",
                    borderRadius: 6,
                    padding: 12,
                    alignItems: "center",
                    flex: 1,
                    marginLeft: 8,
                  }}
                  onPress={() =>
                    setReconsiderModal({
                      visible: false,
                      responseId: null,
                      loading: false,
                      error: null,
                      message: "",
                    })
                  }
                  disabled={reconsiderModal.loading}
                >
                  <Text
                    style={{ color: "white", fontWeight: "bold", fontSize: 16 }}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        {/* Logout modal */}
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
                Session closed due to inactivity
              </Text>
              <Text
                style={{
                  fontSize: 16,
                  color: "#444",
                  marginBottom: 12,
                  textAlign: "center",
                }}
              >
                For security, your session was closed automatically after 2 minutes of inactivity.
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
                  Go to login
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
  header: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 16,
    marginTop: 32,
    textAlign: "center",
  },
  formsScrollWrapper: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  formCardWrapper: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.1)",
  },
  formCard: {
    padding: 16,
  },
  formText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  formDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 12,
  },
  formMeta: {
    fontSize: 12,
    color: "#999",
    marginBottom: 12,
  },
  viewResponsesButton: {
    backgroundColor: "#4B34C7",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
    marginBottom: 8,
  },
  viewResponsesButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  responsesContainer: {
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    padding: 16,
    maxHeight: height * 0.4,
  },
  diligentCard: {
    // Remove backgroundColor, border, marginBottom here if present
    // They are now set inline above for each submission
    // ...existing code...
    // Add only if you want a default padding for all, otherwise keep empty
  },
  diligentHeader: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  diligentMeta: {
    fontSize: 12,
    color: "#999",
    marginBottom: 8,
  },
  noFormsText: {
    textAlign: "center",
    color: "#999",
    fontSize: 16,
    marginTop: 32,
  },
  noResponsesText: {
    textAlign: "center",
    color: "#999",
    fontSize: 14,
    marginTop: 16,
  },
  noAnswersText: {
    textAlign: "center",
    color: "#999",
    fontSize: 14,
    marginTop: 8,
  },
  modalBackground: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  modalContainer: {
    width: width * 0.9,
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    elevation: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 16,
    textAlign: "center",
  },
  modalMessage: {
    fontSize: 14,
    color: "#666",
    marginBottom: 24,
    textAlign: "center",
  },
  modalButton: {
    backgroundColor: "#4B34C7",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    flex: 1,
    marginHorizontal: 4,
  },
  modalButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  cancelButton: {
    backgroundColor: "#ccc",
  },
  reconsiderationInput: {
    width: "100%",
    maxHeight: 120,
    borderColor: "#ccc",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#333",
    marginBottom: 12,
    textAlignVertical: "top",
  },
  reconsiderationError: {
    color: "#ef4444",
    fontSize: 12,
    marginBottom: 12,
    textAlign: "center",
  },
  modalButtonsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
});
