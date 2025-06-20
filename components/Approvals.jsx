import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";

const { width, height } = Dimensions.get("window");

export default function Approvals() {
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);
  const [rejected, setRejected] = useState([]);
  const [show, setShow] = useState("pending"); // "pending" | "approved" | "rejected"
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchApprovals();
  }, []);

  const fetchApprovals = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");

      // Simula endpoints, ajusta según tu API real
      const res = await fetch(
        "https://api-forms-sfi.service.saferut.com/approvals/user-pending",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      setPending(data.pending || []);
      setApproved(data.approved || []);
      setRejected(data.rejected || []);
    } catch (e) {
      setPending([]);
      setApproved([]);
      setRejected([]);
    } finally {
      setLoading(false);
    }
  };

  // Filtra por búsqueda
  const filterList = (list) =>
    list.filter(
      (item) =>
        item.title?.toLowerCase().includes(search.toLowerCase()) ||
        item.user?.toLowerCase().includes(search.toLowerCase())
    );

  // Contadores
  const total = pending.length + approved.length + rejected.length;

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
        {/* Buscador */}
        {/* <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nombre del formato o usuario..."
          value={search}
          onChangeText={setSearch}
        /> */}
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
        {/* Botones de filtro */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[
              styles.filterButton,
              show === "approved" && styles.filterButtonActiveApproved,
            ]}
            onPress={() => setShow("approved")}
          >
            <Text
              style={[
                styles.filterButtonText,
                show === "approved" && styles.filterButtonTextActiveApproved,
              ]}
            >
              Ver aprobados ({approved.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterButton,
              show === "rejected" && styles.filterButtonActiveRejected,
            ]}
            onPress={() => setShow("rejected")}
          >
            <Text
              style={[
                styles.filterButtonText,
                show === "rejected" && styles.filterButtonTextActiveRejected,
              ]}
            >
              Ver rechazados ({rejected.length})
            </Text>
          </TouchableOpacity>
        </View>
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
              {show === "pending" && filterList(pending).length === 0 && (
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
                filterList(pending).map((item, idx) => (
                  <ApprovalCard key={idx} item={item} />
                ))}
              {show === "approved" && filterList(approved).length === 0 && (
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
                filterList(approved).map((item, idx) => (
                  <ApprovalCard key={idx} item={item} approved />
                ))}
              {show === "rejected" && filterList(rejected).length === 0 && (
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
                filterList(rejected).map((item, idx) => (
                  <ApprovalCard key={idx} item={item} rejected />
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

function ApprovalCard({ item, approved, rejected }) {
  return (
    <View
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
          <Text style={styles.approvalTitle}>{item.title}</Text>
          <Text style={styles.approvalMeta}>
            Usuario: {item.user || "Desconocido"}
          </Text>
          <Text style={styles.approvalMeta}>
            Fecha: {item.date || "Sin fecha"}
          </Text>
        </View>
      </View>
      {/* Aquí puedes agregar botones de aprobar/rechazar si es pendiente */}
      {!approved && !rejected && (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.approveBtn}>
            <Text style={styles.actionBtnText}>Aprobar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.rejectBtn}>
            <Text style={styles.actionBtnText}>Rechazar</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
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
  searchInput: {
    backgroundColor: "#f3f4f6",
    borderColor: "#d1d5db",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: width * 0.04,
    marginBottom: 10,
    marginTop: 6,
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
  filterRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 8,
    gap: 8,
  },
  filterButton: {
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginLeft: 8,
  },
  filterButtonActiveApproved: {
    backgroundColor: "#22c55e22",
  },
  filterButtonActiveRejected: {
    backgroundColor: "#ef444422",
  },
  filterButtonText: {
    color: "#222",
    fontWeight: "bold",
    fontSize: width * 0.035,
  },
  filterButtonTextActiveApproved: {
    color: "#22c55e",
  },
  filterButtonTextActiveRejected: {
    color: "#ef4444",
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
