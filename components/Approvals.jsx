import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  TextInput,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { useRouter } from "expo-router";
import ModalFormResponses from "./ModalFormResponses";
import { getMultipleItems } from "../utils/asyncStorageHelper";
import { isOnline } from "../services/offlineManager";
import ConnectionIndicator from "./ConnectionIndicator";

const { width, height } = Dimensions.get("window");
const APPROVALS_OFFLINE_KEY = "approvals_offline";
const APPROVALS_OFFLINE_ACTIONS_KEY = "approvals_offline_actions";
const BACKEND_URL_KEY = "backend_url";

const getBackendUrl = async () => {
  const stored = await AsyncStorage.getItem(BACKEND_URL_KEY);
  return stored || "";
};

// ✅ Componente ApprovalRequirements optimizado con React.memo
const ApprovalRequirements = React.memo(({ requirements, onFillForm }) => {
  return (
    <View style={styles.requirementsContainer}>
      <View style={styles.requirementsHeader}>
        <MaterialIcons name="warning" size={20} color="#d97706" />
        <Text style={styles.requirementsTitle}>
          Formatos requeridos antes de la aprobación
        </Text>
      </View>

      <View style={styles.requirementsList}>
        {requirements.map((requirement) => (
          <View key={requirement.requirement_id} style={styles.requirementCard}>
            <View style={styles.requirementContent}>
              <View
                style={[
                  styles.requirementIconContainer,
                  {
                    backgroundColor: requirement.fulfillment_status.is_fulfilled
                      ? "#dcfce7"
                      : "#f3f4f6",
                  },
                ]}
              >
                {requirement.fulfillment_status.is_fulfilled ? (
                  <MaterialIcons
                    name="check-circle"
                    size={20}
                    color="#16a34a"
                  />
                ) : (
                  <MaterialIcons name="description" size={20} color="#6b7280" />
                )}
              </View>

              <View style={styles.requirementInfo}>
                <Text style={styles.requirementFormTitle}>
                  {requirement.required_form.form_title}
                </Text>
                <Text style={styles.requirementFormDescription}>
                  {requirement.required_form.form_description}
                </Text>
                <Text style={styles.requirementApprover}>
                  Responsable: {requirement.approver.name}
                </Text>
                {requirement.fulfillment_status.is_fulfilled && (
                  <Text style={styles.requirementCompletedDate}>
                    ✓ Completado:{" "}
                    {requirement.fulfillment_status
                      .fulfilling_response_submitted_at
                      ? new Date(
                          requirement.fulfillment_status
                            .fulfilling_response_submitted_at
                        ).toLocaleDateString()
                      : "Fecha no disponible"}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.requirementActions}>
              {requirement.fulfillment_status.is_fulfilled ? (
                <View style={styles.completedBadge}>
                  <Text style={styles.completedBadgeText}>Completado</Text>
                </View>
              ) : (
                <>
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>Pendiente</Text>
                  </View>
                  {onFillForm && (
                    <TouchableOpacity
                      style={styles.fillButton}
                      onPress={() =>
                        onFillForm(
                          requirement.required_form.form_id,
                          requirement.required_form.form_title,
                          requirement.requirement_id
                        )
                      }
                    >
                      <MaterialIcons
                        name="open-in-new"
                        size={14}
                        color="#fff"
                      />
                      <Text style={styles.fillButtonText}>Llenar</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
});

export default function Approvals() {
  const [forms, setForms] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [formGroups, setFormGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [pendingApprovalActions, setPendingApprovalActions] = useState([]);

  // 📌 NUEVOS ESTADOS PARA EL MODAL
  const [isFormResponsesModalOpen, setIsFormResponsesModalOpen] =
    useState(false);
  const [formStatusToView, setFormStatusToView] = useState(null);
  const [formResponsesToShow, setFormResponsesToShow] = useState([]);

  const router = useRouter();

  useEffect(() => {
    loadApprovals();
    loadPendingApprovalActions();

    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
      if (state.isConnected) {
        syncPendingActions();
      }
    });

    return () => unsubscribe();
  }, []);

  const loadApprovals = async (showLoading = true) => {
    if (showLoading) setLoading(true);

    try {
      // Detectar estado de conexión
      const online = await isOnline();
      setIsOffline(!online);
      console.log(
        `📋 [Approvals] Modo: ${online ? "🌐 ONLINE" : "📵 OFFLINE"}`
      );

      let data = [];

      if (online) {
        // MODO ONLINE: Usar endpoint + actualizar caché
        try {
          console.log("🌐 [ONLINE] Obteniendo aprobaciones desde API...");
          const token = await AsyncStorage.getItem("authToken");
          if (!token) throw new Error("No authentication token found");
          const backendUrl = await getBackendUrl();

          const res = await fetch(
            `${backendUrl}/forms/user/assigned-forms-with-responses`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );

          if (!res.ok) throw new Error("Error al cargar aprobaciones");

          data = await res.json();

          // Actualizar caché
          await AsyncStorage.setItem(
            APPROVALS_OFFLINE_KEY,
            JSON.stringify(data)
          );
          console.log(
            `✅ [ONLINE] ${data.length} aprobaciones + caché actualizado`
          );
        } catch (err) {
          console.error("❌ [ONLINE] Error obteniendo aprobaciones:", err);
          // Fallback a caché
          const stored = await AsyncStorage.getItem(APPROVALS_OFFLINE_KEY);
          if (stored) {
            data = JSON.parse(stored);
            console.log("⚠️ [ONLINE] Usando caché por error en API");
          }
        }
      } else {
        // MODO OFFLINE: Solo usar caché
        console.log("📵 [OFFLINE] Obteniendo aprobaciones desde caché...");
        const stored = await AsyncStorage.getItem(APPROVALS_OFFLINE_KEY);
        if (stored) {
          data = JSON.parse(stored);
          console.log(`✅ [OFFLINE] ${data.length} aprobaciones desde caché`);
        } else {
          console.warn("⚠️ [OFFLINE] No hay aprobaciones en caché");
        }
      }

      setForms(data || []);

      // Procesar grupos de formularios pendientes
      const pendingForms = data.filter(
        (form) => form.your_approval_status?.status === "pendiente"
      );
      processFormGroups(pendingForms);
    } catch (e) {
      console.error("❌ [Approvals] Error general:", e);
      setForms([]);
      setFormGroups([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const processFormGroups = (pendingForms) => {
    const grouped = pendingForms.reduce((acc, form) => {
      const key = `${form.submitted_by?.user_id}-${form.form_id}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(form);
      return acc;
    }, {});

    const groups = Object.entries(grouped).map(([key, forms]) => {
      const sortedForms = forms.sort(
        (a, b) =>
          new Date(a.submitted_at).getTime() -
          new Date(b.submitted_at).getTime()
      );

      return {
        key,
        form_title: forms[0].form_title,
        form_id: forms[0].form_id,
        submitted_by: forms[0].submitted_by,
        forms: sortedForms,
        currentIndex: 0,
      };
    });

    setFormGroups(groups);
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadApprovals(false);
  };

  const loadPendingApprovalActions = async () => {
    try {
      const stored = await AsyncStorage.getItem(APPROVALS_OFFLINE_ACTIONS_KEY);
      setPendingApprovalActions(stored ? JSON.parse(stored) : []);
    } catch (e) {
      setPendingApprovalActions([]);
    }
  };

  const syncPendingActions = async () => {
    try {
      const net = await NetInfo.fetch();
      if (!net.isConnected) return;

      const stored = await AsyncStorage.getItem(APPROVALS_OFFLINE_ACTIONS_KEY);
      const actions = stored ? JSON.parse(stored) : [];

      if (actions.length === 0) return;

      const token = await AsyncStorage.getItem("authToken");
      if (!token) return;

      const backendUrl = await getBackendUrl();
      let remaining = [];
      let syncedCount = 0;

      for (const action of actions) {
        try {
          const formData = new FormData();
          formData.append("update_data_json", JSON.stringify(action.body));

          if (action.files && action.files.length > 0) {
            for (const file of action.files) {
              formData.append("files", {
                uri: file.uri,
                name: file.name,
                type: file.type,
              });
            }
          }

          const res = await fetch(
            `${backendUrl}/approvers/update-response-approval/${action.response_id}`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${token}`,
              },
              body: formData,
            }
          );

          if (res.ok) {
            syncedCount++;
          } else {
            remaining.push(action);
          }
        } catch (e) {
          remaining.push(action);
        }
      }

      await AsyncStorage.setItem(
        APPROVALS_OFFLINE_ACTIONS_KEY,
        JSON.stringify(remaining)
      );
      setPendingApprovalActions(remaining);

      if (syncedCount > 0) {
        Alert.alert(
          "Sincronización completada",
          `Se sincronizaron ${syncedCount} acción(es) pendiente(s)`
        );
        loadApprovals();
      }
    } catch (e) {
      console.error("❌ Error en sincronización:", e);
    }
  };

  const navigateResponse = (groupKey, direction) => {
    setFormGroups((prev) =>
      prev.map((group) => {
        if (group.key === groupKey) {
          let newIndex = group.currentIndex;
          if (
            direction === "next" &&
            group.currentIndex < group.forms.length - 1
          ) {
            newIndex = group.currentIndex + 1;
          } else if (direction === "prev" && group.currentIndex > 0) {
            newIndex = group.currentIndex - 1;
          }
          return { ...group, currentIndex: newIndex };
        }
        return group;
      })
    );
  };

  const hasUnfulfilledRequirements = (form) => {
    if (!form.approval_requirements?.has_requirements) {
      return false;
    }
    return form.approval_requirements.requirements.some(
      (req) => !req.fulfillment_status.is_fulfilled
    );
  };

  const calcularDias = (fecha, plazo) => {
    const fechaEnviada = new Date(fecha);
    const hoy = new Date();
    const diferenciaMs = hoy.getTime() - fechaEnviada.getTime();
    const diasPasados = Math.floor(diferenciaMs / (1000 * 60 * 60 * 24));
    const diasRestantes = plazo - diasPasados;
    const vencido = diasPasados > plazo;
    return { diasPasados, diasRestantes, vencido };
  };

  const handleViewDetail = (group) => {
    const currentForm = group.forms[group.currentIndex];
    router.push({
      pathname: "/approval-detail",
      params: { response_id: currentForm.response_id },
    });
  };

  // 📌 NUEVA FUNCIÓN: Descargar archivo
  const handleDownloadFile = async (fileName) => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      const backendUrl = await getBackendUrl();

      // Aquí implementarías la lógica de descarga según tu backend
      Alert.alert("Descarga", `Descargando archivo: ${fileName}`);

      // Ejemplo de implementación básica:
      // const response = await fetch(
      //   `${backendUrl}/responses/download-file/${fileName}`,
      //   { headers: { Authorization: `Bearer ${token}` } }
      // );

      // Luego usar expo-file-system o similar para guardar el archivo
    } catch (error) {
      console.error("Error al descargar archivo:", error);
      Alert.alert("Error", "No se pudo descargar el archivo");
    }
  };

  // 📌 NUEVA FUNCIÓN: Abrir modal de formularios (aprobados/rechazados)
  const openFormResponsesModal = (status) => {
    setFormStatusToView(status);
    setFormResponsesToShow(
      status === "approved"
        ? aprovedForms.filter(
            (form) =>
              form.form_title
                .toLowerCase()
                .includes(searchText.toLowerCase()) ||
              form.submitted_by?.name
                .toLowerCase()
                .includes(searchText.toLowerCase())
          )
        : noAprovedForms.filter(
            (form) =>
              form.form_title
                .toLowerCase()
                .includes(searchText.toLowerCase()) ||
              form.submitted_by?.name
                .toLowerCase()
                .includes(searchText.toLowerCase())
          )
    );
    setIsFormResponsesModalOpen(true);
  };

  // 📌 NUEVA FUNCIÓN: Callback para actualizar formularios después de cambios
  const handleFormsUpdate = (updatedData, counts) => {
    setForms(updatedData || []);
    const pendingForms = updatedData.filter(
      (form) => form.your_approval_status?.status === "pendiente"
    );
    processFormGroups(pendingForms);
  };

  const aprovedForms = forms.filter(
    (form) => form.your_approval_status?.status === "aprobado"
  );
  const noAprovedForms = forms.filter(
    (form) => form.your_approval_status?.status === "rechazado"
  );

  const filteredGroups = formGroups.filter(
    (group) =>
      group.form_title.toLowerCase().includes(searchText.toLowerCase()) ||
      group.submitted_by?.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const totalPendingForms = formGroups.reduce(
    (total, group) => total + group.forms.length,
    0
  );

  return (
    <View style={styles.container}>
      {/* Indicador de conexión */}
      <ConnectionIndicator />

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#0F8594"]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header Mejorado */}
        <LinearGradient
          colors={["rgba(255, 255, 255, 0.9)", "rgba(255, 255, 255, 0.7)"]}
          style={styles.headerCard}
        >
          <View style={styles.headerBackground}>
            <View style={[styles.decorCircle, styles.decorCircle1]} />
            <View style={[styles.decorCircle, styles.decorCircle2]} />
          </View>

          <View style={styles.headerContent}>
            <View style={styles.headerTop}>
              <View style={styles.headerLeft}>
                <LinearGradient
                  colors={["#0F8594", "#14b8a6"]}
                  style={styles.headerIconContainer}
                >
                  <MaterialIcons name="check-circle" size={32} color="#fff" />
                </LinearGradient>
                <View style={styles.headerTextContainer}>
                  <Text style={styles.headerTitle}>Centro de Aprobaciones</Text>
                  <Text style={styles.headerSubtitle}>
                    Revisa y aprueba formularios pendientes
                    {refreshing && " • Actualizando..."}
                  </Text>
                </View>
              </View>

              {isOffline && (
                <View style={styles.offlineIndicator}>
                  <MaterialIcons name="cloud-off" size={20} color="#ef4444" />
                </View>
              )}
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => loadApprovals(true)}
                disabled={loading}
                style={styles.updateButton}
              >
                <MaterialIcons
                  name="refresh"
                  size={18}
                  color="#2563eb"
                  style={{
                    transform: [{ rotate: loading ? "360deg" : "0deg" }],
                  }}
                />
                <Text style={styles.updateButtonText}>Actualizar</Text>
              </TouchableOpacity>

              {/* 📌 MODIFICADO: Ahora abre el modal en lugar de navegar */}
              <TouchableOpacity
                onPress={() => openFormResponsesModal("approved")}
                style={styles.viewApprovedButton}
              >
                <MaterialIcons name="check-circle" size={18} color="#16a34a" />
                <Text style={styles.viewApprovedButtonText}>
                  Aprobados ({aprovedForms.length})
                </Text>
              </TouchableOpacity>

              {/* 📌 MODIFICADO: Ahora abre el modal en lugar de navegar */}
              <TouchableOpacity
                onPress={() => openFormResponsesModal("rejected")}
                style={styles.viewRejectedButton}
              >
                <MaterialIcons name="cancel" size={18} color="#dc2626" />
                <Text style={styles.viewRejectedButtonText}>
                  Rechazados ({noAprovedForms.length})
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>

        {/* Barra de búsqueda */}
        <View style={styles.searchContainer}>
          <MaterialIcons
            name="search"
            size={20}
            color="#9ca3af"
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nombre del formato o usuario..."
            value={searchText}
            onChangeText={setSearchText}
            placeholderTextColor="#4B5563"
          />
        </View>

        {/* Estadísticas */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <View
              style={[styles.statIconContainer, { backgroundColor: "#fef3c7" }]}
            >
              <MaterialIcons name="schedule" size={24} color="#f59e0b" />
            </View>
            <Text style={styles.statValue}>{totalPendingForms}</Text>
            <Text style={styles.statLabel}>Pendientes</Text>
          </View>

          <View style={styles.statCard}>
            <View
              style={[styles.statIconContainer, { backgroundColor: "#dcfce7" }]}
            >
              <MaterialIcons name="check-circle" size={24} color="#16a34a" />
            </View>
            <Text style={styles.statValue}>{aprovedForms.length}</Text>
            <Text style={styles.statLabel}>Aprobados</Text>
          </View>

          <View style={styles.statCard}>
            <View
              style={[styles.statIconContainer, { backgroundColor: "#fee2e2" }]}
            >
              <MaterialIcons name="cancel" size={24} color="#dc2626" />
            </View>
            <Text style={styles.statValue}>{noAprovedForms.length}</Text>
            <Text style={styles.statLabel}>Rechazados</Text>
          </View>

          <View style={styles.statCard}>
            <View
              style={[styles.statIconContainer, { backgroundColor: "#dbeafe" }]}
            >
              <MaterialIcons name="info" size={24} color="#2563eb" />
            </View>
            <Text style={styles.statValue}>{forms.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
        </View>

        {/* Acciones pendientes de sincronización */}
        {pendingApprovalActions.length > 0 && (
          <View style={styles.pendingActionsContainer}>
            <View style={styles.pendingActionsHeader}>
              <MaterialIcons name="sync" size={20} color="#ef4444" />
              <Text style={styles.pendingActionsTitle}>
                Acciones pendientes de sincronización
              </Text>
            </View>
            {pendingApprovalActions.map((action, idx) => (
              <View key={idx} style={styles.pendingActionCard}>
                <View style={styles.pendingActionInfo}>
                  <Text style={styles.pendingActionText}>
                    Formulario ID: {action.response_id}
                  </Text>
                  <Text
                    style={[
                      styles.pendingActionStatus,
                      {
                        color:
                          action.body.status === "aprobado"
                            ? "#22c55e"
                            : "#ef4444",
                      },
                    ]}
                  >
                    {action.body.status === "aprobado"
                      ? "Aprobado"
                      : "Rechazado"}
                  </Text>
                </View>
                <Text style={styles.pendingActionDate}>
                  Guardado: {new Date(action.timestamp).toLocaleString()}
                </Text>
              </View>
            ))}
            <TouchableOpacity
              onPress={syncPendingActions}
              style={styles.syncButton}
              disabled={isOffline}
            >
              <MaterialIcons name="sync" size={20} color="#fff" />
              <Text style={styles.syncButtonText}>
                {isOffline ? "Sin conexión" : "Sincronizar ahora"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Lista de formularios pendientes */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0F8594" />
            <Text style={styles.loadingText}>Cargando aprobaciones...</Text>
          </View>
        ) : filteredGroups.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>🎉</Text>
            <Text style={styles.emptyStateTitle}>¡Todo al día!</Text>
            <Text style={styles.emptyStateText}>
              No hay formularios pendientes por revisar.
            </Text>
          </View>
        ) : (
          <View style={styles.formsList}>
            {filteredGroups.map((group) => {
              const currentForm = group.forms[group.currentIndex];
              if (!currentForm) return null;

              const { diasPasados, diasRestantes, vencido } = calcularDias(
                currentForm.submitted_at,
                currentForm.deadline_days
              );

              return (
                <View
                  key={`${group.key}-${group.currentIndex}`}
                  style={styles.formCard}
                >
                  <View style={styles.formCardContent}>
                    <View style={styles.formHeader}>
                      <Text style={styles.formTitle}>
                        {currentForm.form_title}
                      </Text>

                      {/* Indicador de múltiples respuestas */}
                      {group.forms.length > 1 && (
                        <View style={styles.multiResponseContainer}>
                          <View style={styles.multiResponseBadge}>
                            <MaterialIcons
                              name="tag"
                              size={14}
                              color="#2563eb"
                            />
                            <Text style={styles.multiResponseText}>
                              {group.forms.length} respuestas
                            </Text>
                          </View>

                          {/* Navegador */}
                          <View style={styles.navigationContainer}>
                            <TouchableOpacity
                              onPress={() =>
                                navigateResponse(group.key, "prev")
                              }
                              disabled={group.currentIndex === 0}
                              style={[
                                styles.navButton,
                                group.currentIndex === 0 &&
                                  styles.navButtonDisabled,
                              ]}
                            >
                              <MaterialIcons
                                name="chevron-left"
                                size={18}
                                color={
                                  group.currentIndex === 0
                                    ? "#d1d5db"
                                    : "#4b5563"
                                }
                              />
                            </TouchableOpacity>

                            <View style={styles.navCounter}>
                              <Text style={styles.navCounterText}>
                                {group.currentIndex + 1} de {group.forms.length}
                              </Text>
                            </View>

                            <TouchableOpacity
                              onPress={() =>
                                navigateResponse(group.key, "next")
                              }
                              disabled={
                                group.currentIndex === group.forms.length - 1
                              }
                              style={[
                                styles.navButton,
                                group.currentIndex === group.forms.length - 1 &&
                                  styles.navButtonDisabled,
                              ]}
                            >
                              <MaterialIcons
                                name="chevron-right"
                                size={18}
                                color={
                                  group.currentIndex === group.forms.length - 1
                                    ? "#d1d5db"
                                    : "#4b5563"
                                }
                              />
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>

                    <Text style={styles.formDescription}>
                      {currentForm.form_description}
                    </Text>

                    <View style={styles.formMeta}>
                      <Text style={styles.formMetaItem}>
                        📤 {currentForm.submitted_by?.name || "Desconocido"}
                      </Text>
                      <Text style={styles.formMetaItem}>
                        📅{" "}
                        {new Date(
                          currentForm.submitted_at
                        ).toLocaleDateString()}
                      </Text>
                      <Text style={styles.formMetaItem}>
                        🆔 Respuesta #{currentForm.response_id}
                      </Text>
                    </View>

                    {/* Deadline badge */}
                    {currentForm.deadline_days !== undefined && (
                      <View
                        style={[
                          styles.deadlineBadge,
                          vencido
                            ? styles.deadlineVencido
                            : diasRestantes === 0
                              ? styles.deadlineHoy
                              : diasRestantes <= 2
                                ? styles.deadlineProximo
                                : styles.deadlineNormal,
                        ]}
                      >
                        <Text style={styles.deadlineBadgeText}>
                          {vencido
                            ? `⚠️ Vencido hace ${
                                diasPasados - currentForm.deadline_days
                              } día(s)`
                            : diasRestantes === 0
                              ? "⏰ Vence hoy"
                              : diasRestantes <= 2
                                ? `⚠️ ${diasRestantes} día(s) restantes`
                                : `⏳ ${diasRestantes} días restantes`}
                        </Text>
                      </View>
                    )}

                    {/* Ver detalle button */}
                    <TouchableOpacity
                      style={styles.viewDetailButton}
                      onPress={() => handleViewDetail(group)}
                    >
                      <MaterialIcons name="visibility" size={18} color="#fff" />
                      <Text style={styles.viewDetailButtonText}>
                        Ver detalle
                      </Text>
                    </TouchableOpacity>

                    {/* Cadena de aprobación */}
                    <View style={styles.approvalChainContainer}>
                      <Text style={styles.approvalChainTitle}>
                        Cadena de aprobación:
                      </Text>
                      <View style={styles.approvalChainList}>
                        {currentForm.all_approvers?.map((approver, index) => (
                          <View
                            key={index}
                            style={[
                              styles.approverBadge,
                              approver.status === "aprobado"
                                ? styles.approverApproved
                                : approver.status === "rechazado"
                                  ? styles.approverRejected
                                  : styles.approverPending,
                            ]}
                          >
                            <Text style={styles.approverBadgeText}>
                              #{approver.sequence_number} {approver.user?.name}{" "}
                              • {approver.status}
                              {approver.is_mandatory && " (Obligatorio)"}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>

                    {/* Requisitos de aprobación */}
                    {currentForm.approval_requirements?.has_requirements && (
                      <ApprovalRequirements
                        requirements={
                          currentForm.approval_requirements.requirements
                        }
                      />
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* 📌 NUEVO: Modal de formularios aprobados/rechazados */}
      {isFormResponsesModalOpen && formStatusToView && (
        <ModalFormResponses
          type={formStatusToView}
          forms={formResponsesToShow}
          onClose={() => setIsFormResponsesModalOpen(false)}
          onDownloadFile={handleDownloadFile}
          onFormsUpdate={handleFormsUpdate}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  headerCard: {
    borderRadius: 24,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  headerBackground: {
    position: "absolute",
    width: "100%",
    height: "100%",
  },
  decorCircle: {
    position: "absolute",
    borderRadius: 9999,
  },
  decorCircle1: {
    width: 200,
    height: 200,
    backgroundColor: "rgba(15, 133, 148, 0.1)",
    top: -100,
    right: -50,
  },
  decorCircle2: {
    width: 150,
    height: 150,
    backgroundColor: "rgba(20, 184, 166, 0.1)",
    bottom: -75,
    left: -50,
  },
  headerContent: {
    padding: 20,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  headerIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#0F8594",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  headerTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#0F8594",
  },
  offlineIndicator: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fee2e2",
    justifyContent: "center",
    alignItems: "center",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  updateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 8,
  },
  updateButtonText: {
    color: "#2563eb",
    fontSize: 12,
    fontWeight: "600",
  },
  viewApprovedButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 8,
  },
  viewApprovedButtonText: {
    color: "#16a34a",
    fontSize: 12,
    fontWeight: "600",
  },
  viewRejectedButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 8,
  },
  viewRejectedButtonText: {
    color: "#dc2626",
    fontSize: 12,
    fontWeight: "600",
  },
  searchContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: "#1f2937",
  },
  statsContainer: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: "#6b7280",
  },
  pendingActionsContainer: {
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  pendingActionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  pendingActionsTitle: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "bold",
    color: "#dc2626",
  },
  pendingActionCard: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  pendingActionInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  pendingActionText: {
    fontSize: 13,
    color: "#1f2937",
    fontWeight: "600",
  },
  pendingActionStatus: {
    fontSize: 13,
    fontWeight: "bold",
  },
  pendingActionDate: {
    fontSize: 11,
    color: "#6b7280",
  },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563eb",
    padding: 10,
    borderRadius: 8,
    marginTop: 4,
    gap: 6,
  },
  syncButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 13,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    color: "#0F8594",
    fontSize: 14,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#0F8594",
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },
  formsList: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  formCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  formCardContent: {
    padding: 16,
  },
  formHeader: {
    marginBottom: 8,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 8,
  },
  multiResponseContainer: {
    marginTop: 8,
  },
  multiResponseBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#dbeafe",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  multiResponseText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563eb",
  },
  navigationContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    padding: 4,
    alignSelf: "flex-start",
  },
  navButton: {
    padding: 4,
    borderRadius: 6,
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  navCounter: {
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    minWidth: 70,
    alignItems: "center",
  },
  navCounterText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1f2937",
  },
  formDescription: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 8,
    lineHeight: 20,
  },
  formMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 12,
  },
  formMetaItem: {
    fontSize: 12,
    color: "#6b7280",
  },
  deadlineBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 12,
  },
  deadlineVencido: {
    backgroundColor: "#fee2e2",
  },
  deadlineHoy: {
    backgroundColor: "#fed7aa",
  },
  deadlineProximo: {
    backgroundColor: "#fef3c7",
  },
  deadlineNormal: {
    backgroundColor: "#d1fae5",
  },
  deadlineBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1f2937",
  },
  viewDetailButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#6b7280",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  viewDetailButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  approvalChainContainer: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  approvalChainTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 8,
  },
  approvalChainList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  approverBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  approverApproved: {
    backgroundColor: "#dcfce7",
  },
  approverRejected: {
    backgroundColor: "#fee2e2",
  },
  approverPending: {
    backgroundColor: "#fef3c7",
  },
  approverBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  requirementsContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fcd34d",
    borderRadius: 8,
  },
  requirementsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  requirementsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#92400e",
  },
  requirementsList: {
    gap: 10,
  },
  requirementCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#fcd34d",
    borderRadius: 8,
    padding: 10,
  },
  requirementContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },
  requirementIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  requirementInfo: {
    flex: 1,
  },
  requirementFormTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 2,
  },
  requirementFormDescription: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 2,
  },
  requirementApprover: {
    fontSize: 11,
    color: "#6b7280",
  },
  requirementCompletedDate: {
    fontSize: 11,
    color: "#16a34a",
    marginTop: 4,
  },
  requirementActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "flex-end",
  },
  completedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#dcfce7",
    borderRadius: 999,
  },
  completedBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#16a34a",
  },
  pendingBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fee2e2",
    borderRadius: 999,
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#dc2626",
  },
  fillButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#2563eb",
    borderRadius: 8,
  },
  fillButtonText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
  },
});
