import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { useRouter } from "expo-router";

const { width, height } = Dimensions.get("window");
const APPROVALS_OFFLINE_KEY = "approvals_offline";
const APPROVALS_OFFLINE_ACTIONS_KEY = "approvals_offline_actions"; // NUEVO

export default function Approvals() {
  const [loading, setLoading] = useState(true);
  const [allApprovals, setAllApprovals] = useState([]);
  const [show, setShow] = useState("pending"); // "pending" | "approved" | "rejected"
  const [isOffline, setIsOffline] = useState(false);
  const [pendingApprovalActions, setPendingApprovalActions] = useState([]);
  const router = useRouter();

  useEffect(() => {
    loadApprovals();
    loadPendingApprovalActions();
  }, []);

  // Cargar aprobaciones desde API o memoria
  const loadApprovals = async () => {
    setLoading(true);
    try {
      const net = await NetInfo.fetch();
      setIsOffline(!net.isConnected);

      if (net.isConnected) {
        const token = await AsyncStorage.getItem("authToken");
        if (!token) throw new Error("No authentication token found");

        const res = await fetch(
          "https://api-forms-sfi.service.saferut.com/forms/user/assigned-forms-with-responses",
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const data = await res.json();
        console.log("🟢 Aprobaciones recibidas:", data);
        setAllApprovals(data || []);
        await AsyncStorage.setItem(APPROVALS_OFFLINE_KEY, JSON.stringify(data));
      } else {
        // Modo offline
        const stored = await AsyncStorage.getItem(APPROVALS_OFFLINE_KEY);
        if (stored) {
          const offlineData = JSON.parse(stored);
          setAllApprovals(offlineData);
          console.log("🟠 Aprobaciones cargadas offline:", offlineData);
        } else {
          setAllApprovals([]);
        }
      }
    } catch (e) {
      setAllApprovals([]);
      console.error("❌ Error cargando aprobaciones:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadPendingApprovalActions = async () => {
    try {
      const stored = await AsyncStorage.getItem(APPROVALS_OFFLINE_ACTIONS_KEY);
      setPendingApprovalActions(stored ? JSON.parse(stored) : []);
    } catch (e) {
      setPendingApprovalActions([]);
    }
  };

  // Filtrar por estado de aprobación
  const filterByStatus = (status) =>
    allApprovals.filter(
      (item) =>
        item.your_approval_status && item.your_approval_status.status === status
    );

  // Contadores
  const pending = filterByStatus("pendiente");
  const approved = filterByStatus("aprobado");
  const rejected = filterByStatus("rechazado");
  const total = allApprovals.length;

  // Guardar acción offline (aprobación/rechazo)
  const saveOfflineApprovalAction = async (
    response_id,
    action,
    message = ""
  ) => {
    try {
      const key = APPROVALS_OFFLINE_ACTIONS_KEY;
      const stored = await AsyncStorage.getItem(key);
      const arr = stored ? JSON.parse(stored) : [];
      // El cuerpo debe ser igual al del endpoint
      const now = new Date();
      const reviewed_at = now.toISOString();
      // Busca el formulario para obtener la secuencia
      const form = allApprovals.find(
        (f) => String(f.response_id) === String(response_id)
      );
      const selectedSequence = form?.your_approval_status?.sequence_number || 1;
      arr.push({
        response_id,
        body: {
          status: action,
          reviewed_at,
          message,
          selectedSequence,
        },
        timestamp: Date.now(),
      });
      await AsyncStorage.setItem(key, JSON.stringify(arr));
      setPendingApprovalActions(arr);
      console.log("🟠 Acción de aprobación offline guardada:", {
        response_id,
        action,
        message,
        selectedSequence,
      });
    } catch (e) {
      console.error("❌ Error guardando acción offline:", e);
    }
  };

  // Sincronizar acciones pendientes cuando hay internet
  useEffect(() => {
    const syncPendingActions = async () => {
      const net = await NetInfo.fetch();
      if (!net.isConnected) return;
      const stored = await AsyncStorage.getItem(APPROVALS_OFFLINE_ACTIONS_KEY);
      const actions = stored ? JSON.parse(stored) : [];
      if (actions.length === 0) return;
      const token = await AsyncStorage.getItem("authToken");
      if (!token) return;
      let remaining = [];
      for (const action of actions) {
        try {
          const res = await fetch(
            `https://api-forms-sfi.service.saferut.com/forms/update-response-approval/${action.response_id}`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(action.body),
            }
          );
          const data = await res.json();
          if (res.ok) {
            console.log("🟢 Acción de aprobación sincronizada:", action);
            // Elimina de la lista de pendientes
          } else {
            console.error("❌ Error al sincronizar acción:", data);
            remaining.push(action);
          }
        } catch (e) {
          console.error("❌ Error al sincronizar acción:", e);
          remaining.push(action);
        }
      }
      await AsyncStorage.setItem(
        APPROVALS_OFFLINE_ACTIONS_KEY,
        JSON.stringify(remaining)
      );
      setPendingApprovalActions(remaining);
      // Recargar aprobaciones para actualizar las listas
      loadApprovals();
    };
    syncPendingActions();
  }, [isOffline]);

  // Botón aprobar/rechazar
  const handleApproveReject = async (item, action) => {
    const message = ""; // Puedes pedir mensaje si lo deseas
    if (isOffline) {
      await saveOfflineApprovalAction(item.response_id, action, message);
      Alert.alert(
        "Guardado Offline",
        `La acción de ${action === "aprobado" ? "aprobación" : "rechazo"} se guardó para sincronizar cuando tengas conexión.`
      );
      // Opcional: actualizar UI localmente
      loadApprovals();
    } else {
      try {
        const token = await AsyncStorage.getItem("authToken");
        if (!token) throw new Error("No authentication token found");
        const now = new Date();
        const reviewed_at = now.toISOString();
        const selectedSequence =
          item.your_approval_status?.sequence_number || 1;
        const body = {
          status: action,
          reviewed_at,
          message,
          selectedSequence,
        };
        const res = await fetch(
          `https://api-forms-sfi.service.saferut.com/forms/update-response-approval/${item.response_id}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        );
        const data = await res.json();
        if (res.ok) {
          Alert.alert(
            "Éxito",
            `Formulario ${action === "aprobado" ? "aprobado" : "rechazado"} correctamente.`
          );
          // Actualiza la lista localmente
          loadApprovals();
        } else {
          throw new Error(data?.detail || "Error en la aprobación");
        }
      } catch (e) {
        Alert.alert(
          "Error",
          "No se pudo enviar la aprobación. Se guardará para sincronizar offline."
        );
        await saveOfflineApprovalAction(item.response_id, action, message);
        loadApprovals();
      }
    }
  };

  return (
    <LinearGradient colors={["#f7fafc", "#e6fafd"]} style={{ flex: 1 }}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <MaterialIcons name="check-circle" size={32} color="#12A0AF" />
          <View style={{ marginLeft: 10 }}>
            <Text style={styles.headerTitle}>Centro de Aprobaciones</Text>
            <Text style={styles.headerSubtitle}>
              Revisa y aprueba formularios pendientes
            </Text>
          </View>
        </View>
        {/* Contadores */}
        <View style={styles.countersRow}>
          <CounterBox
            icon="schedule"
            color="#fbbf24"
            label="Pendientes"
            value={pending.length}
            active={show === "pending"}
            onPress={() => setShow("pending")}
          />
          <CounterBox
            icon="check-circle"
            color="#22c55e"
            label="Aprobados"
            value={approved.length}
            active={show === "approved"}
            onPress={() => setShow("approved")}
          />
          <CounterBox
            icon="cancel"
            color="#ef4444"
            label="Rechazados"
            value={rejected.length}
            active={show === "rejected"}
            onPress={() => setShow("rejected")}
          />
          <CounterBox
            icon="info"
            color="#2563eb"
            label="Total"
            value={total}
            active={false}
            onPress={() => {}}
          />
        </View>
        {/* Lista de pendientes de envío de aprobación/rechazo */}
        {pendingApprovalActions.length > 0 && (
          <View style={{ marginBottom: 12, marginTop: 8 }}>
            <Text
              style={{ color: "#ef4444", fontWeight: "bold", marginBottom: 4 }}
            >
              Pendientes de envío de aprobación/rechazo:
            </Text>
            {pendingApprovalActions.map((action, idx) => (
              <View
                key={idx}
                style={{
                  backgroundColor: "#fff7f7",
                  borderColor: "#ef4444",
                  borderWidth: 1,
                  borderRadius: 8,
                  padding: 8,
                  marginBottom: 6,
                }}
              >
                <Text style={{ color: "#222" }}>
                  Formulario ID: {action.response_id} - Acción:{" "}
                  <Text
                    style={{
                      fontWeight: "bold",
                      color:
                        action.body.status === "aprobado"
                          ? "#22c55e"
                          : "#ef4444",
                    }}
                  >
                    {action.body.status}
                  </Text>
                </Text>
                <Text style={{ color: "#888", fontSize: 12 }}>
                  Guardado offline el:{" "}
                  {new Date(action.timestamp).toLocaleString()}
                </Text>
              </View>
            ))}
          </View>
        )}
        {/* Lista de formatos */}
        <View style={styles.listContainer}>
          {loading ? (
            <ActivityIndicator size="large" color="#12A0AF" />
          ) : (
            <ScrollView
              contentContainerStyle={{
                flexGrow: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 10,
              }}
            >
              {show === "pending" && pending.length === 0 && (
                <View style={styles.emptyBox}>
                  <MaterialIcons
                    name="celebration"
                    size={48}
                    color="#12A0AF"
                    style={{ marginBottom: 8 }}
                  />
                  <Text style={styles.emptyTitle}>¡Todo al día!</Text>
                  <Text style={styles.emptySubtitle}>
                    No hay formularios pendientes por revisar.
                  </Text>
                </View>
              )}
              {show === "pending" &&
                pending.map((item, idx) => (
                  <ApprovalCard
                    key={idx}
                    item={item}
                    onApprove={() => handleApproveReject(item, "aprobado")}
                    onReject={() => handleApproveReject(item, "rechazado")}
                    onPress={() =>
                      router.push({
                        pathname: "/approval-detail",
                        params: { response_id: item.response_id },
                        // Puedes pasar más datos si lo deseas
                        // params: { ...item }
                      })
                    }
                  />
                ))}
              {show === "approved" && approved.length === 0 && (
                <View style={styles.emptyBox}>
                  <MaterialIcons
                    name="check-circle"
                    size={48}
                    color="#22c55e"
                    style={{ marginBottom: 8 }}
                  />
                  <Text style={styles.emptyTitle}>Sin aprobados</Text>
                  <Text style={styles.emptySubtitle}>
                    No hay formularios aprobados.
                  </Text>
                </View>
              )}
              {show === "approved" &&
                approved.map((item, idx) => (
                  <ApprovalCard
                    key={idx}
                    item={item}
                    approved
                    onPress={() =>
                      router.push({
                        pathname: "/approval-detail",
                        params: { response_id: item.response_id },
                      })
                    }
                  />
                ))}
              {show === "rejected" && rejected.length === 0 && (
                <View style={styles.emptyBox}>
                  <MaterialIcons
                    name="cancel"
                    size={48}
                    color="#ef4444"
                    style={{ marginBottom: 8 }}
                  />
                  <Text style={styles.emptyTitle}>Sin rechazados</Text>
                  <Text style={styles.emptySubtitle}>
                    No hay formularios rechazados.
                  </Text>
                </View>
              )}
              {show === "rejected" &&
                rejected.map((item, idx) => (
                  <ApprovalCard
                    key={idx}
                    item={item}
                    rejected
                    onPress={() =>
                      router.push({
                        pathname: "/approval-detail",
                        params: { response_id: item.response_id },
                      })
                    }
                  />
                ))}
            </ScrollView>
          )}
        </View>
      </View>
    </LinearGradient>
  );
}

function CounterBox({ icon, color, label, value, active, onPress }) {
  return (
    <TouchableOpacity
      style={[
        styles.counterBox,
        { borderColor: color, backgroundColor: active ? color + "22" : "#fff" },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <MaterialIcons name={icon} size={28} color={color} />
      <Text style={[styles.counterValue, { color }]}>{value}</Text>
      <Text style={styles.counterLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function ApprovalCard({
  item,
  approved,
  rejected,
  onApprove,
  onReject,
  onPress,
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.approvalCard,
        approved && { borderColor: "#22c55e" },
        rejected && { borderColor: "#ef4444" },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <MaterialIcons
          name={
            approved ? "check-circle" : rejected ? "cancel" : "hourglass-empty"
          }
          size={28}
          color={approved ? "#22c55e" : rejected ? "#ef4444" : "#fbbf24"}
          style={{ marginRight: 10 }}
        />
        <View>
          <Text style={styles.approvalTitle}>{item.form_title}</Text>
          <Text style={styles.approvalMeta}>
            Usuario: {item.submitted_by?.name || "Desconocido"}
          </Text>
          <Text style={styles.approvalMeta}>
            Fecha: {item.submitted_at?.split("T")[0] || "Sin fecha"}
          </Text>
          <Text style={styles.approvalMeta}>
            Estado: {item.your_approval_status?.status}
          </Text>
        </View>
      </View>
      {/* Mostrar respuestas del formulario */}
      <View style={{ marginTop: 8 }}>
        {Array.isArray(item.answers) &&
          item.answers.map((ans, i) => (
            <View key={i} style={{ flexDirection: "row", marginBottom: 2 }}>
              <Text style={{ fontWeight: "bold", color: "#4B34C7" }}>
                {ans.question_text}:
              </Text>
              <Text style={{ marginLeft: 4, color: "#222" }}>
                {ans.answer_text || ans.file_path || "-"}
              </Text>
            </View>
          ))}
      </View>
      {/* Botones de aprobar/rechazar solo si está pendiente */}
      {!approved && !rejected && (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.approveBtn} onPress={onApprove}>
            <Text style={styles.actionBtnText}>Aprobar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.rejectBtn} onPress={onReject}>
            <Text style={styles.actionBtnText}>Rechazar</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: width * 0.04, backgroundColor: "transparent" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    marginTop: 8,
  },
  headerTitle: {
    fontSize: width * 0.06,
    fontWeight: "bold",
    color: "#222",
  },
  headerSubtitle: {
    fontSize: width * 0.035,
    color: "#12A0AF",
    marginTop: 2,
  },
  countersRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 10,
    gap: 6,
  },
  counterBox: {
    flex: 1,
    alignItems: "center",
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 8,
    marginHorizontal: 2,
    backgroundColor: "#fff",
  },
  counterValue: {
    fontWeight: "bold",
    fontSize: width * 0.05,
    marginTop: 2,
  },
  counterLabel: {
    fontSize: width * 0.032,
    color: "#444",
    marginTop: 2,
  },
  listContainer: {
    flex: 1,
    marginTop: 8,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 8,
    minHeight: height * 0.3,
  },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 40,
  },
  emptyTitle: {
    fontWeight: "bold",
    fontSize: width * 0.05,
    color: "#12A0AF",
    marginBottom: 2,
  },
  emptySubtitle: {
    fontSize: width * 0.038,
    color: "#888",
    textAlign: "center",
  },
  approvalCard: {
    borderWidth: 2,
    borderColor: "#fbbf24",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    backgroundColor: "#f9fafb",
    width: width * 0.92,
    alignSelf: "center",
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  approvalTitle: {
    fontWeight: "bold",
    fontSize: width * 0.045,
    color: "#222",
    marginBottom: 2,
  },
  approvalMeta: {
    fontSize: width * 0.035,
    color: "#12A0AF",
    marginBottom: 1,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 10,
    gap: 10,
  },
  approveBtn: {
    backgroundColor: "#22c55e",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
    marginLeft: 8,
  },
  rejectBtn: {
    backgroundColor: "#ef4444",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
    marginLeft: 8,
  },
  actionBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: width * 0.035,
  },
});
