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
import { isOnline } from "../services/offlineManager";
import ConnectionIndicator from "./ConnectionIndicator";

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

  // 🔍 BÚSQUEDA
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredForms, setFilteredForms] = useState([]);

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

  // 🔍 Filtrar formularios cuando cambia la búsqueda o los formularios
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredForms(forms);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = forms.filter((form) => {
        // Buscar en título
        if (form.form_title?.toLowerCase().includes(query)) return true;
        // Buscar en descripción
        if (form.form_description?.toLowerCase().includes(query)) return true;
        // Buscar en respuestas
        const responses = responsesByForm[form.id] || [];
        return responses.some((resp) => {
          // Buscar en respuestas individuales
          if (
            resp.answers?.some(
              (ans) =>
                ans.question_text?.toLowerCase().includes(query) ||
                ans.answer_text?.toLowerCase().includes(query)
            )
          )
            return true;
          // Buscar en usuario
          if (resp.submitted_by?.name?.toLowerCase().includes(query))
            return true;
          return false;
        });
      });
      setFilteredForms(filtered);
    }
  }, [searchQuery, forms, responsesByForm]);

  const handleViewForms = async (page = 1, append = false) => {
    if (!append) {
      setLoading(true);
      setCurrentPage(1);
      setHasMore(true);
    }

    try {
      // Detectar estado de conexión
      const online = await isOnline();
      console.log(`📋 [MyForms] Modo: ${online ? "🌐 ONLINE" : "📵 OFFLINE"}`);

      let formsList = [];
      let grouped = {};

      if (online) {
        // MODO ONLINE: Usar endpoint + actualizar caché
        try {
          console.log("🌐 [ONLINE] Obteniendo mis formularios desde API...");
          const accessToken = await AsyncStorage.getItem("authToken");
          const backendUrl = await getBackendUrl();

          if (!accessToken || !backendUrl) {
            throw new Error("No hay token o URL del backend");
          }

          // ✅ OPTIMIZADO: Carga paginada
          console.log(
            `🌐 Obteniendo respuestas página ${page} (${PAGE_SIZE} items)...`
          );
          const responsesRes = await fetch(
            `${backendUrl}/responses/with-answers`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (responsesRes.status === 401) {
            throw new Error("Unauthorized - Token inválido");
          }

          const allResponsesData = await responsesRes.json();

          if (!allResponsesData || !Array.isArray(allResponsesData.forms)) {
            throw new Error("No se pudieron cargar las respuestas.");
          }

          // Procesar datos con paginación
          const startIndex = (page - 1) * PAGE_SIZE;
          const endIndex = startIndex + PAGE_SIZE;
          const paginatedForms = allResponsesData.forms.slice(
            startIndex,
            endIndex
          );

          setHasMore(endIndex < allResponsesData.forms.length);

          grouped = append ? { ...responsesByForm } : {};
          formsList = append ? [...forms] : [];

          for (const formData of paginatedForms) {
            if (formData.response_count > 0) {
              if (!formsList.find((f) => f.id === formData.form_id)) {
                formsList.push({
                  id: formData.form_id,
                  form_title: formData.form_title || "Sin título",
                  form_description: formData.form_description || "",
                  submitted_by: formData.responses[0]?.submitted_by || {},
                });
              }
              grouped[formData.form_id] = formData.responses;
            }
          }

          setResponsesByForm(grouped);
          setForms(formsList);

          // Actualizar caché (solo primera página)
          if (page === 1) {
            await AsyncStorage.setItem(
              MY_FORMS_OFFLINE_KEY,
              JSON.stringify({ formsList, grouped })
            );
            console.log("✅ [ONLINE] Mis formularios + caché actualizado");
          }
        } catch (err) {
          console.error("❌ [ONLINE] Error obteniendo mis formularios:", err);
          // Fallback a caché
          if (page === 1) {
            const stored = await AsyncStorage.getItem(MY_FORMS_OFFLINE_KEY);
            if (stored) {
              const cached = JSON.parse(stored);
              formsList = cached.formsList || [];
              grouped = cached.grouped || {};
              console.log("⚠️ [ONLINE] Usando caché por error en API");
            }
          }
        }
      } else {
        // MODO OFFLINE: Solo usar caché
        console.log("📵 [OFFLINE] Obteniendo mis formularios desde caché...");
        try {
          const stored = await AsyncStorage.getItem(MY_FORMS_OFFLINE_KEY);
          if (stored) {
            const cached = JSON.parse(stored);
            formsList = cached.formsList || [];
            grouped = cached.grouped || {};
            setHasMore(false);
            console.log(
              `✅ [OFFLINE] ${formsList.length} formularios desde caché`
            );
          } else {
            console.warn("⚠️ [OFFLINE] No hay formularios en caché");
          }
        } catch (err) {
          console.error("❌ [OFFLINE] Error leyendo caché:", err);
        }
      }

      setResponsesByForm(grouped);
      setForms(formsList);
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

  const formatDate = (dateString) => {
    if (!dateString) return "Unknown";
    try {
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch (e) {
      return dateString;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E3A8A" />

      {/* Indicador de conexión */}
      <ConnectionIndicator />

      {/* Header corporativo */}
      <LinearGradient
        colors={["#4C34C7", "#4C34C7"]}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerWithBack}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Submitted Forms</Text>
            <Text style={styles.headerSubtitle}>
              Review and Manage Submissions
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* 🔍 Buscador estilo Google */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search forms, responses, or users..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery("")}
              style={styles.clearButton}
            >
              <Text style={styles.clearButtonText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        {searchQuery.length > 0 && (
          <Text style={styles.searchResults}>
            {filteredForms.length}{" "}
            {filteredForms.length === 1 ? "result" : "results"} found
          </Text>
        )}
      </View>

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

              if (isCloseToBottom && hasMore && !loadingMore && !searchQuery) {
                loadMoreForms();
              }
            }}
            scrollEventThrottle={400}
          >
            {filteredForms.length === 0 && searchQuery ? (
              <View style={styles.emptySearchContainer}>
                <Text style={styles.emptySearchIcon}>🔍</Text>
                <Text style={styles.emptySearchTitle}>No results found</Text>
                <Text style={styles.emptySearchText}>
                  Try searching with different keywords
                </Text>
              </View>
            ) : (
              filteredForms.map((form, index) => (
                <View key={form.id} style={styles.formCard}>
                  {/* Header del formulario */}
                  <View style={styles.formHeader}>
                    <View style={styles.formIdBadge}>
                      <Text style={styles.formIdText}>ID: 00{form.id}</Text>
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

                    <View style={styles.formMeta}></View>
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
                                    {formatDate(resp.submitted_at)}
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
                                    >
                                      {resp.approvals.map((appr, i) => (
                                        <View
                                          key={i}
                                          style={styles.approvalItem}
                                        >
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
              ))
            )}

            {/* Indicador de carga al final */}
            {loadingMore && !searchQuery && (
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
  headerWithBack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 4,
  },
  backButtonText: {
    fontSize: 24,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  headerContent: {
    alignItems: "center",
    flex: 1,
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
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  formHeader: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  formIdBadge: {
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  formIdText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#4F46E5",
    letterSpacing: 0.2,
  },
  formContent: {
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  formTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 3,
    lineHeight: 20,
  },
  formDescription: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 16,
    marginBottom: 8,
  },
  formMeta: {
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 8,
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
    paddingVertical: 10,
    marginHorizontal: 14,
    marginBottom: 10,
    borderRadius: 8,
    shadowColor: "#108C9B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  expandButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: 0.3,
    marginRight: 6,
  },
  expandButtonIcon: {
    fontSize: 11,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  responsesSection: {
    backgroundColor: "#F9FAFB",
  },
  responsesDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 14,
    marginBottom: 12,
  },
  responsesScroll: {
    maxHeight: height * 0.7,
    paddingHorizontal: 14,
    paddingBottom: 16,
  },
  responseCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
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
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  responseNumber: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: 0.1,
  },
  responseInfo: {
    marginBottom: 6,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
  },
  infoLabel: {
    fontSize: 10,
    color: "#6B7280",
    fontWeight: "500",
    marginRight: 4,
    width: 40,
  },
  infoValue: {
    fontSize: 10,
    color: "#374151",
    fontWeight: "600",
    flex: 1,
  },
  modeBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  modeText: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  messageContainer: {
    backgroundColor: "#FEF3C7",
    borderLeftWidth: 2,
    borderLeftColor: "#F59E0B",
    padding: 6,
    borderRadius: 4,
    marginTop: 4,
  },
  messageLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: "#92400E",
    marginBottom: 2,
  },
  messageText: {
    fontSize: 10,
    color: "#78350F",
    lineHeight: 13,
  },
  answersSection: {
    borderTopColor: "#F3F4F6",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 5,
    letterSpacing: 0.1,
  },
  answersScroll: {
    maxHeight: height * 0.25,
  },
  answerItem: {
    backgroundColor: "#F9FAFB",
    padding: 6,
    borderRadius: 6,
    marginBottom: 4,
    borderLeftWidth: 2,
    borderLeftColor: "#108C9B",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  questionText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 2,
    lineHeight: 13,
  },
  answerText: {
    fontSize: 10,
    color: "#6B7280",
    lineHeight: 13,
  },
  approvalsSection: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  approvalsScroll: {
    maxHeight: height * 0.2,
  },
  approvalItem: {
    backgroundColor: "#F0F9FF",
    padding: 6,
    borderRadius: 6,
    marginBottom: 4,
    borderLeftWidth: 2,
    borderLeftColor: "#0EA5E9",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  approvalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  approvalLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: "#0C4A6E",
  },
  approvalValue: {
    fontSize: 9,
    color: "#075985",
  },
  approvalMessageBox: {
    backgroundColor: "#FEE2E2",
    padding: 4,
    borderRadius: 4,
    marginTop: 3,
  },
  approvalMessage: {
    fontSize: 9,
    color: "#991B1B",
    fontStyle: "italic",
  },
  reconsiderButton: {
    backgroundColor: "#F59E0B",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 5,
    alignItems: "center",
    marginTop: 6,
    shadowColor: "#F59E0B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 1,
  },
  reconsiderButtonText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: 0.1,
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
  // 🔍 Estilos del buscador
  searchContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: "#F3F4F6",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#374151",
    paddingVertical: 0,
  },
  clearButton: {
    padding: 4,
    marginLeft: 8,
  },
  clearButtonText: {
    fontSize: 18,
    color: "#9CA3AF",
    fontWeight: "600",
  },
  searchResults: {
    marginTop: 8,
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  emptySearchContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptySearchIcon: {
    fontSize: 56,
    marginBottom: 16,
    opacity: 0.6,
  },
  emptySearchTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySearchText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
});
