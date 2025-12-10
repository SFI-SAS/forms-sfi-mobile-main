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
  StatusBar,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

const { width, height } = Dimensions.get("window");
const RESPONSES_OFFLINE_KEY = "responses_with_answers_offline";
const RESPONSES_DETAIL_OFFLINE_KEY = "responses_detail_offline";
const MY_FORMS_OFFLINE_KEY = "my_forms_offline";
const BACKEND_URL_KEY = "backend_url";

const getBackendUrl = async () => {
  const stored = await AsyncStorage.getItem(BACKEND_URL_KEY);
  return stored || "";
};

export default function MyForms() {
  const [forms, setForms] = useState([]);
  const [expandedForms, setExpandedForms] = useState({});
  const [responsesByForm, setResponsesByForm] = useState({});
  const [responsesDetail, setResponsesDetail] = useState({});
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

  // 🔥 PAGINACIÓN
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 15;

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

  const handleAuthError = async (error) => {
    const errorMessage = error?.message || error?.toString() || "";

    if (
      errorMessage.includes("No authentication token") ||
      errorMessage.includes("authentication token") ||
      errorMessage.includes("Unauthorized") ||
      errorMessage.includes("401")
    ) {
      console.log("🔒 Token inválido o ausente. Cerrando sesión...");

      await AsyncStorage.setItem("isLoggedOut", "true");
      await AsyncStorage.removeItem("authToken");

      Alert.alert(
        "Session Expired",
        "Your session has expired or is invalid. Please log in again.",
        [
          {
            text: "Accept",
            onPress: () => router.replace("/"),
          },
        ],
        { cancelable: false }
      );

      return true;
    }

    return false;
  };

  useEffect(() => {
    const checkAuthToken = async () => {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        console.log(
          "🔒 No hay token al cargar MyForms. Redirigiendo al login..."
        );
        Alert.alert(
          "Invalid Session",
          "No active session found. Please log in.",
          [
            {
              text: "Accept",
              onPress: () => router.replace("/"),
            },
          ],
          { cancelable: false }
        );
      }
    };

    checkAuthToken();
  }, []);

  useEffect(() => {
    handleViewForms();
  }, []);

  const handleViewForms = async (page = 1, append = false) => {
    if (!append) {
      setLoading(true);
      setCurrentPage(1);
      setHasMore(true);
    }

    try {
      const accessToken = await AsyncStorage.getItem("authToken");

      if (!accessToken) {
        console.log("🔒 No hay token disponible en MyForms");
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      let formsList = [];
      let grouped = {};

      const offlineDataRaw = await AsyncStorage.getItem(MY_FORMS_OFFLINE_KEY);
      let offlineData = offlineDataRaw ? JSON.parse(offlineDataRaw) : null;

      // Si es offline y no estamos agregando, usar caché
      if (!accessToken && offlineData && !append) {
        setForms(offlineData.formsList || []);
        setResponsesByForm(offlineData.grouped || {});
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      let onlineOk = false;
      if (accessToken) {
        try {
          const backendUrl = await getBackendUrl();

          // ✅ OPTIMIZADO: Carga paginada
          console.log(
            `🌐 Obteniendo respuestas página ${page} (${PAGE_SIZE} items)...`
          );
          const responsesRes = await fetch(
            `${backendUrl}/responses/get_responses/all`,
            {
              method: "GET",
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );

          if (responsesRes.status === 401) {
            throw new Error("Unauthorized - Token inválido");
          }

          const allResponsesData = await responsesRes.json();
          console.log("✅ Respuestas completas obtenidas");

          if (!allResponsesData || !Array.isArray(allResponsesData.forms)) {
            throw new Error("No se pudieron cargar las respuestas.");
          }

          // ✅ PROCESAR datos con paginación simulada
          const startIndex = (page - 1) * PAGE_SIZE;
          const endIndex = startIndex + PAGE_SIZE;
          const paginatedForms = allResponsesData.forms.slice(
            startIndex,
            endIndex
          );

          // Determinar si hay más datos
          const hasMoreData = endIndex < allResponsesData.forms.length;
          setHasMore(hasMoreData);

          grouped = append ? { ...responsesByForm } : {};
          formsList = append ? [...forms] : [];

          for (const formData of paginatedForms) {
            if (formData.response_count > 0) {
              // Agregar formulario a la lista si no existe
              if (!formsList.find((f) => f.id === formData.form_id)) {
                formsList.push({
                  id: formData.form_id,
                  form_title: formData.form_title || "Sin título",
                  form_description: formData.form_description || "",
                  submitted_by: formData.responses[0]?.submitted_by || {},
                });
              }

              // Organizar respuestas por form_id
              grouped[formData.form_id] = formData.responses;
            }
          }

          setResponsesByForm(grouped);
          setForms(formsList);

          // ✅ GUARDAR solo primera página en cache
          if (page === 1) {
            await AsyncStorage.setItem(
              MY_FORMS_OFFLINE_KEY,
              JSON.stringify({ formsList, grouped })
            );
            console.log("✅ Cache actualizado");
          }

          onlineOk = true;
        } catch (err) {
          console.error("❌ Error obteniendo respuestas:", err);
          onlineOk = false;
        }
      }

      // ✅ FALLBACK a cache offline si la consulta online falla
      if (!onlineOk && offlineData && !append) {
        setForms(offlineData.formsList || []);
        setResponsesByForm(offlineData.grouped || {});
      }
    } catch (error) {
      console.error("❌ Error al cargar formularios enviados:", error);

      const isAuthError = await handleAuthError(error);

      if (!isAuthError) {
        if (!append) {
          setForms([]);
          setResponsesByForm({});
        }
        Alert.alert("Error", "Unable to load submitted forms.");
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // 🔥 SCROLL INFINITO: Cargar más formularios
  const loadMoreForms = async () => {
    if (!hasMore || loadingMore || loading) return;

    setLoadingMore(true);
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    await handleViewForms(nextPage, true);
  };

  const toggleExpand = (formId) => {
    setExpandedForms((prev) => ({
      ...prev,
      [formId]: !prev[formId],
    }));
  };

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
          error: "You must enter a reconsideration message.",
        }));
        return;
      }
      const backendUrl = await getBackendUrl();
      const url = `${backendUrl}/responses/set_reconsideration/${reconsiderModal.responseId}?mensaje_reconsideracion=${encodeURIComponent(
        reconsiderModal.message
      )}`;

      const res = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (res.status === 401) {
        throw new Error("Unauthorized - Token inválido");
      }

      let data;
      try {
        data = await res.json();
      } catch (e) {
        data = {};
      }
      if (!res.ok) {
        let msg = "Unable to request reconsideration. Please try again.";
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
        "Reconsideration Submitted",
        "Your reconsideration request was submitted successfully."
      );
      handleViewForms();
    } catch (error) {
      console.error("❌ Error en reconsideración:", error);

      const isAuthError = await handleAuthError(error);

      if (!isAuthError) {
        setReconsiderModal((prev) => ({
          ...prev,
          loading: false,
          error:
            error.message ||
            "Unable to request reconsideration. Please try again.",
        }));
      } else {
        setReconsiderModal({
          visible: false,
          responseId: null,
          loading: false,
          error: null,
          message: "",
        });
      }
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "aprobado":
        return "#10B981";
      case "rechazado":
        return "#EF4444";
      default:
        return "#F59E0B";
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case "aprobado":
        return "Approved";
      case "rechazado":
        return "Rejected";
      case "pendiente":
        return "Pending";
      default:
        return status || "Unknown";
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E3A8A" />

      {/* Header corporativo */}
      <LinearGradient
        colors={["#4C34C7", "#4C34C7"]}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Submitted Forms</Text>
          <Text style={styles.headerSubtitle}>
            Review and Manage Submissions
          </Text>
        </View>
      </LinearGradient>

      {/* Contenido principal */}
      <View style={styles.mainContent}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#108C9B" />
            <Text style={styles.loadingText}>Loading forms...</Text>
          </View>
        ) : forms.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No Forms Available</Text>
            <Text style={styles.emptyText}>
              You don't have any submitted forms at this moment.
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            onScroll={({ nativeEvent }) => {
              const { layoutMeasurement, contentOffset, contentSize } =
                nativeEvent;
              const paddingToBottom = 50;
              const isCloseToBottom =
                layoutMeasurement.height + contentOffset.y >=
                contentSize.height - paddingToBottom;

              if (isCloseToBottom && hasMore && !loadingMore) {
                loadMoreForms();
              }
            }}
            scrollEventThrottle={400}
          >
            {forms.map((form, index) => (
              <View key={form.id} style={styles.formCard}>
                {/* Header del formulario */}
                <View style={styles.formHeader}>
                  <View style={styles.formIdBadge}>
                    <Text style={styles.formIdText}>ID: {form.id}</Text>
                  </View>
                </View>

                {/* Contenido del formulario */}
                <View style={styles.formContent}>
                  <Text style={styles.formTitle} numberOfLines={2}>
                    {form.form_title || "Untitled Form"}
                  </Text>

                  {form.form_description ? (
                    <Text style={styles.formDescription} numberOfLines={3}>
                      {form.form_description}
                    </Text>
                  ) : null}

                  <View style={styles.formMeta}>
                    <View style={styles.metaItem}>
                      <Text style={styles.metaLabel}>Submitted by:</Text>
                      <Text style={styles.metaValue}>
                        {form.submitted_by?.name || "Unknown"}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Botón para expandir respuestas */}
                <TouchableOpacity
                  style={styles.expandButton}
                  onPress={() => toggleExpand(form.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.expandButtonText}>
                    {expandedForms[form.id]
                      ? "Hide Responses"
                      : "View Responses"}
                  </Text>
                  <Text style={styles.expandButtonIcon}>
                    {expandedForms[form.id] ? "▲" : "▼"}
                  </Text>
                </TouchableOpacity>

                {/* Respuestas expandidas */}
                {expandedForms[form.id] && (
                  <View style={styles.responsesSection}>
                    <View style={styles.responsesDivider} />
                    <ScrollView
                      style={styles.responsesScroll}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                    >
                      {Array.isArray(responsesByForm[form.id]) &&
                      responsesByForm[form.id].length > 0 ? (
                        responsesByForm[form.id].map((resp, idx) => (
                          <View
                            key={resp.response_id || idx}
                            style={styles.responseCard}
                          >
                            {/* Header de respuesta */}
                            <View style={styles.responseHeader}>
                              <Text style={styles.responseNumber}>
                                Submission #{idx + 1}
                              </Text>
                              <View
                                style={[
                                  styles.statusBadge,
                                  {
                                    backgroundColor: getStatusColor(
                                      resp.approval_status
                                    ),
                                  },
                                ]}
                              >
                                <Text style={styles.statusBadgeText}>
                                  {getStatusLabel(resp.approval_status)}
                                </Text>
                              </View>
                            </View>

                            {/* Información de la respuesta */}
                            <View style={styles.responseInfo}>
                              <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Date:</Text>
                                <Text style={styles.infoValue}>
                                  {resp.submitted_at || "Unknown"}
                                </Text>
                              </View>

                              <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Mode:</Text>
                                <View
                                  style={[
                                    styles.modeBadge,
                                    {
                                      backgroundColor:
                                        resp.mode === "offline"
                                          ? "#FEE2E2"
                                          : "#D1FAE5",
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.modeText,
                                      {
                                        color:
                                          resp.mode === "offline"
                                            ? "#DC2626"
                                            : "#059669",
                                      },
                                    ]}
                                  >
                                    {resp.mode === "offline"
                                      ? "● Offline"
                                      : "● Online"}
                                  </Text>
                                </View>
                              </View>

                              {resp.message ? (
                                <View style={styles.messageContainer}>
                                  <Text style={styles.messageLabel}>
                                    Message:
                                  </Text>
                                  <Text style={styles.messageText}>
                                    {resp.message}
                                  </Text>
                                </View>
                              ) : null}
                            </View>

                            {/* Respuestas del formulario */}
                            {Array.isArray(resp.answers) &&
                            resp.answers.length > 0 ? (
                              <View style={styles.answersSection}>
                                <Text style={styles.sectionTitle}>
                                  Form Answers
                                </Text>
                                <ScrollView
                                  style={styles.answersScroll}
                                  nestedScrollEnabled
                                  showsVerticalScrollIndicator={false}
                                >
                                  {resp.answers.map((ans, i) => (
                                    <View key={i} style={styles.answerItem}>
                                      <Text style={styles.questionText}>
                                        {ans.question_text}
                                      </Text>
                                      <Text style={styles.answerText}>
                                        {ans.answer_text ||
                                          ans.file_path ||
                                          "-"}
                                      </Text>
                                    </View>
                                  ))}
                                </ScrollView>
                              </View>
                            ) : null}

                            {/* Detalles de aprobación */}
                            {Array.isArray(resp.approvals) &&
                              resp.approvals.length > 0 && (
                                <View style={styles.approvalsSection}>
                                  <Text style={styles.sectionTitle}>
                                    Approval Details
                                  </Text>
                                  <ScrollView
                                    style={styles.approvalsScroll}
                                    nestedScrollEnabled
                                    showsVerticalScrollIndicator={false}
                                  >
                                    {resp.approvals.map((appr, i) => (
                                      <View key={i} style={styles.approvalItem}>
                                        <View style={styles.approvalRow}>
                                          <Text style={styles.approvalLabel}>
                                            Sequence:
                                          </Text>
                                          <Text style={styles.approvalValue}>
                                            {appr.sequence_number}
                                          </Text>
                                        </View>
                                        <View style={styles.approvalRow}>
                                          <Text style={styles.approvalLabel}>
                                            Status:
                                          </Text>
                                          <Text
                                            style={[
                                              styles.approvalValue,
                                              { fontWeight: "600" },
                                            ]}
                                          >
                                            {appr.status}
                                          </Text>
                                        </View>
                                        <View style={styles.approvalRow}>
                                          <Text style={styles.approvalLabel}>
                                            User:
                                          </Text>
                                          <Text style={styles.approvalValue}>
                                            {appr.user?.name || "-"}
                                          </Text>
                                        </View>
                                        <View style={styles.approvalRow}>
                                          <Text style={styles.approvalLabel}>
                                            Mandatory:
                                          </Text>
                                          <Text style={styles.approvalValue}>
                                            {appr.is_mandatory ? "Yes" : "No"}
                                          </Text>
                                        </View>
                                        {appr.message && (
                                          <View
                                            style={styles.approvalMessageBox}
                                          >
                                            <Text
                                              style={styles.approvalMessage}
                                            >
                                              {appr.message}
                                            </Text>
                                          </View>
                                        )}
                                      </View>
                                    ))}
                                  </ScrollView>
                                </View>
                              )}

                            {/* Botón de reconsideración */}
                            {resp.approval_status === "rechazado" && (
                              <TouchableOpacity
                                style={styles.reconsiderButton}
                                onPress={() =>
                                  handleReconsider(resp.response_id)
                                }
                                activeOpacity={0.8}
                              >
                                <Text style={styles.reconsiderButtonText}>
                                  Request Reconsideration
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        ))
                      ) : (
                        <View style={styles.noResponsesContainer}>
                          <Text style={styles.noResponsesText}>
                            No responses available for this form.
                          </Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                )}
              </View>
            ))}

            {/* Indicador de carga al final */}
            {loadingMore && (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <ActivityIndicator size="large" color="#108C9B" />
                <Text style={styles.loadingText}>Loading more...</Text>
              </View>
            )}

            {!hasMore && forms.length > 0 && (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <Text style={{ color: "#666", fontSize: 14 }}>
                  All forms loaded
                </Text>
              </View>
            )}
          </ScrollView>
        )}
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Request Reconsideration</Text>
            <Text style={styles.modalDescription}>
              Please provide a detailed reason for requesting reconsideration of
              this rejected form.
            </Text>

            <TextInput
              style={styles.modalInput}
              multiline
              placeholder="Enter your reason here..."
              placeholderTextColor="#4B5563"
              value={reconsiderModal.message}
              onChangeText={(text) =>
                setReconsiderModal((prev) => ({ ...prev, message: text }))
              }
              editable={!reconsiderModal.loading}
              textAlignVertical="top"
            />

            {reconsiderModal.error && (
              <Text style={styles.modalError}>{reconsiderModal.error}</Text>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
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
                activeOpacity={0.7}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.modalButtonSubmit,
                  reconsiderModal.loading && styles.modalButtonDisabled,
                ]}
                onPress={submitReconsideration}
                disabled={reconsiderModal.loading}
                activeOpacity={0.7}
              >
                {reconsiderModal.loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalButtonTextSubmit}>Submit</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de logout por inactividad */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Session Expired</Text>
            <Text style={styles.modalDescription}>
              Your session has been closed due to inactivity for security
              reasons. Please log in again to continue.
            </Text>

            <TouchableOpacity
              style={[
                styles.modalButton,
                styles.modalButtonSubmit,
                { width: "100%" },
              ]}
              onPress={() => {
                setShowLogoutModal(false);
                router.replace("/");
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.modalButtonTextSubmit}>Go to Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  header: {
    paddingTop: 50,
    paddingBottom: 30,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  headerContent: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#E0E7FF",
    letterSpacing: 0.3,
    fontWeight: "400",
  },
  mainContent: {
    flex: 1,
    marginTop: -15,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#F3F4F6",
    paddingTop: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#6B7280",
    fontWeight: "500",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 12,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  formHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  formIdBadge: {
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  formIdText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4F46E5",
    letterSpacing: 0.3,
  },
  formContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
    lineHeight: 28,
  },
  formDescription: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
    marginBottom: 16,
  },
  formMeta: {
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  metaLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
    marginRight: 6,
  },
  metaValue: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "600",
  },
  expandButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#108C9B",
    paddingVertical: 14,
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 10,
    shadowColor: "#108C9B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  expandButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: 0.3,
    marginRight: 8,
  },
  expandButtonIcon: {
    fontSize: 12,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  responsesSection: {
    backgroundColor: "#F9FAFB",
  },
  responsesDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 20,
    marginBottom: 12,
  },
  responsesScroll: {
    maxHeight: height * 0.6,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  responseCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  responseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  responseNumber: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  responseInfo: {
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
    marginRight: 8,
    width: 60,
  },
  infoValue: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "600",
    flex: 1,
  },
  modeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  modeText: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  messageContainer: {
    backgroundColor: "#FEF3C7",
    borderLeftWidth: 3,
    borderLeftColor: "#F59E0B",
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  messageLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#92400E",
    marginBottom: 4,
  },
  messageText: {
    fontSize: 13,
    color: "#78350F",
    lineHeight: 18,
  },
  answersSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 10,
  },
  answersScroll: {
    maxHeight: height * 0.2,
  },
  answerItem: {
    backgroundColor: "#F9FAFB",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#108C9B",
  },
  questionText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
  },
  answerText: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  approvalsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  approvalsScroll: {
    maxHeight: height * 0.18,
  },
  approvalItem: {
    backgroundColor: "#F0F9FF",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#0EA5E9",
  },
  approvalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  approvalLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0C4A6E",
  },
  approvalValue: {
    fontSize: 12,
    color: "#075985",
  },
  approvalMessageBox: {
    backgroundColor: "#FEE2E2",
    padding: 8,
    borderRadius: 6,
    marginTop: 6,
  },
  approvalMessage: {
    fontSize: 12,
    color: "#991B1B",
    fontStyle: "italic",
  },
  reconsiderButton: {
    backgroundColor: "#F59E0B",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
    shadowColor: "#F59E0B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  reconsiderButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  noResponsesContainer: {
    paddingVertical: 32,
    alignItems: "center",
  },
  noResponsesText: {
    fontSize: 14,
    color: "#9CA3AF",
    fontStyle: "italic",
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
    textAlign: "center",
  },
  modalDescription: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 20,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    color: "#374151",
    minHeight: 100,
    backgroundColor: "#F9FAFB",
    marginBottom: 16,
  },
  modalError: {
    fontSize: 13,
    color: "#DC2626",
    marginBottom: 16,
    textAlign: "center",
    fontWeight: "500",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  modalButtonCancel: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  modalButtonSubmit: {
    backgroundColor: "#108C9B",
    shadowColor: "#108C9B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  modalButtonDisabled: {
    opacity: 0.6,
  },
  modalButtonTextCancel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6B7280",
  },
  modalButtonTextSubmit: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
});
