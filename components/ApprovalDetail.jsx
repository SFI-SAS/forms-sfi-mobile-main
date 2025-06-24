// Nuevo componente para mostrar el detalle de un formulario de aprobación
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  TextInput,
  TouchableOpacity,
  BackHandler,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

const { width, height } = Dimensions.get("window");
const APPROVALS_OFFLINE_KEY = "approvals_offline";
const APPROVAL_DETAIL_OFFLINE_KEY = "approval_detail_offline"; // NUEVO

export default function ApprovalDetail() {
  const { response_id } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [accepting, setAccepting] = useState(false);
  const router = useRouter();

  // Bloquea el botón físico de volver atrás
  useEffect(() => {
    const disableBack = () => true;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      disableBack
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    loadDetail();
  }, [response_id]);

  const loadDetail = async () => {
    setLoading(true);
    try {
      // Busca primero en memoria offline (detalle específico)
      const storedDetail = await AsyncStorage.getItem(
        APPROVAL_DETAIL_OFFLINE_KEY
      );
      let found = null;
      if (storedDetail) {
        const arr = JSON.parse(storedDetail);
        found = arr.find((f) => String(f.response_id) === String(response_id));
      }
      if (found) {
        setForm(found);
        setLoading(false);
        return;
      }
      // Si no está en memoria de detalles, busca en la lista general
      const stored = await AsyncStorage.getItem(APPROVALS_OFFLINE_KEY);
      if (stored) {
        const arr = JSON.parse(stored);
        found = arr.find((f) => String(f.response_id) === String(response_id));
        if (found) {
          setForm(found);
          // Guarda también en el detalle offline para alta disponibilidad
          await saveDetailOffline(found);
          setLoading(false);
          return;
        }
      }
      // Si no está en memoria, intenta online
      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");
      const res = await fetch(
        "https://api-forms-sfi.service.saferut.com/forms/user/assigned-forms-with-responses",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      const match = Array.isArray(data)
        ? data.find((f) => String(f.response_id) === String(response_id))
        : null;
      setForm(match || null);
      if (match) {
        await saveDetailOffline(match);
      }
    } catch (e) {
      setForm(null);
    } finally {
      setLoading(false);
    }
  };

  // Guarda el detalle en un array en memoria para alta disponibilidad offline
  const saveDetailOffline = async (detail) => {
    try {
      const stored = await AsyncStorage.getItem(APPROVAL_DETAIL_OFFLINE_KEY);
      let arr = stored ? JSON.parse(stored) : [];
      // Reemplaza si ya existe
      arr = arr.filter(
        (f) => String(f.response_id) !== String(detail.response_id)
      );
      arr.push(detail);
      await AsyncStorage.setItem(
        APPROVAL_DETAIL_OFFLINE_KEY,
        JSON.stringify(arr)
      );
      // DEBUG
      console.log("🟢 Detalle de aprobación guardado offline:", detail);
    } catch (e) {
      console.error("❌ Error guardando detalle offline:", e);
    }
  };

  const handleAcceptReconsideration = async () => {
    setAccepting(true);
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");
      const res = await fetch(
        `https://api-forms-sfi.service.saferut.com/responses/accept_reconsideration/${response_id}`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data?.detail ||
            "No se pudo aceptar la reconsideración. Intenta de nuevo."
        );
      }
      Alert.alert(
        "Reconsideración aceptada",
        "La reconsideración fue aceptada."
      );
      loadDetail();
    } catch (error) {
      Alert.alert(
        "Error",
        error.message || "No se pudo aceptar la reconsideración."
      );
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <LinearGradient colors={["#f7fafc", "#e6fafd"]} style={{ flex: 1 }}>
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <ActivityIndicator size="large" color="#12A0AF" />
          <Text style={{ marginTop: 12, color: "#12A0AF" }}>
            Cargando detalle...
          </Text>
        </View>
      </LinearGradient>
    );
  }

  if (!form) {
    return (
      <LinearGradient colors={["#f7fafc", "#e6fafd"]} style={{ flex: 1 }}>
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <MaterialIcons name="error" size={48} color="#ef4444" />
          <Text style={{ marginTop: 12, color: "#ef4444" }}>
            No se encontró el formulario.
          </Text>
        </View>
      </LinearGradient>
    );
  }

  // Renderiza preguntas y respuestas como inputs bloqueados
  const renderAnswers = () => {
    if (!Array.isArray(form.answers) || form.answers.length === 0) {
      return <Text style={styles.infoText}>No hay respuestas.</Text>;
    }
    return form.answers.map((ans, idx) => {
      let inputProps = {
        editable: false,
        style: styles.inputDisabled,
        value: ans.answer_text || ans.file_path || "",
        placeholder: "-",
      };
      // Ajusta el tipo de input según el tipo de pregunta
      if (ans.question_type === "number") {
        inputProps.keyboardType = "numeric";
      }
      if (ans.question_type === "date") {
        inputProps.value = ans.answer_text || "";
        inputProps.placeholder = "Fecha";
      }
      if (ans.question_type === "file") {
        inputProps.value = ans.file_path || "";
        inputProps.placeholder = "Archivo";
      }
      return (
        <View key={idx} style={styles.qaInputRow}>
          <Text style={styles.questionLabel}>{ans.question_text}</Text>
          <TextInput {...inputProps} />
        </View>
      );
    });
  };

  return (
    <LinearGradient colors={["#f7fafc", "#e6fafd"]} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{form.form_title}</Text>
        <Text style={styles.desc}>{form.form_description}</Text>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Información del envío</Text>
          <Text style={styles.infoText}>
            <Text style={styles.infoLabel}>Respondido por: </Text>
            {form.submitted_by?.name || "Desconocido"}
          </Text>
          <Text style={styles.infoText}>
            <Text style={styles.infoLabel}>Email: </Text>
            {form.submitted_by?.email || "-"}
          </Text>
          <Text style={styles.infoText}>
            <Text style={styles.infoLabel}>Documento: </Text>
            {form.submitted_by?.num_document || "-"}
          </Text>
          <Text style={styles.infoText}>
            <Text style={styles.infoLabel}>Fecha de envío: </Text>
            {form.submitted_at || "-"}
          </Text>
          <Text style={styles.infoText}>
            <Text style={styles.infoLabel}>Estado de aprobación: </Text>
            {form.your_approval_status?.status || "-"}
          </Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preguntas y respuestas</Text>
          {renderAnswers()}
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Aprobadores</Text>
          {Array.isArray(form.all_approvers) &&
          form.all_approvers.length > 0 ? (
            form.all_approvers.map((appr, idx) => (
              <View key={idx} style={styles.approverRow}>
                <Text style={styles.infoText}>
                  <Text style={styles.infoLabel}>Nombre: </Text>
                  {appr.user?.name || "-"}
                </Text>
                <Text style={styles.infoText}>
                  <Text style={styles.infoLabel}>Secuencia: </Text>
                  {appr.sequence_number}
                </Text>
                <Text style={styles.infoText}>
                  <Text style={styles.infoLabel}>Estado: </Text>
                  {appr.status}
                </Text>
                <Text style={styles.infoText}>
                  <Text style={styles.infoLabel}>¿Obligatorio?: </Text>
                  {appr.is_mandatory ? "Sí" : "No"}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.infoText}>No hay aprobadores.</Text>
          )}
        </View>

        {/* Mostrar mensaje y botón solo si está rechazado y tiene reconsideración */}
        {form.your_approval_status?.status === "rechazado" &&
          form.reconsideration_requested && (
            <View style={styles.reconsiderationBox}>
              <Text style={styles.reconsiderationMsg}>
                Este formulario con estado{" "}
                <Text style={{ color: "#ef4444", fontWeight: "bold" }}>
                  rechazado
                </Text>{" "}
                ha sido seleccionado para una reconsideración.
              </Text>
              <TouchableOpacity
                style={styles.acceptButton}
                onPress={handleAcceptReconsideration}
                disabled={accepting}
              >
                <Text style={styles.acceptButtonText}>
                  {accepting ? "Aceptando..." : "Aceptar reconsideración"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Volver atrás</Text>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: width * 0.06,
    paddingBottom: 40,
  },
  title: {
    fontSize: width * 0.06,
    fontWeight: "bold",
    color: "#4B34C7",
    marginBottom: 4,
  },
  desc: {
    fontSize: width * 0.04,
    color: "#12A0AF",
    marginBottom: 12,
  },
  section: {
    marginBottom: 18,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionTitle: {
    fontWeight: "bold",
    fontSize: width * 0.045,
    color: "#2563eb",
    marginBottom: 6,
  },
  infoText: {
    fontSize: width * 0.038,
    color: "#222",
    marginBottom: 2,
  },
  infoLabel: {
    fontWeight: "bold",
    color: "#4B34C7",
  },
  qaInputRow: {
    marginBottom: 12,
  },
  questionLabel: {
    fontWeight: "bold",
    color: "#12A0AF",
    fontSize: width * 0.04,
    marginBottom: 2,
  },
  inputDisabled: {
    backgroundColor: "#f3f4f6",
    borderColor: "#d1d5db",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: width * 0.04,
    color: "#888",
  },
  approverRow: {
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  backButton: {
    marginTop: 18,
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  backButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: width * 0.045,
  },
  errorText: {
    color: "#ef4444",
    fontSize: width * 0.045,
    textAlign: "center",
    marginTop: 40,
  },
  reconsiderationBox: {
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    padding: 12,
    marginTop: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#ef4444",
    alignItems: "center",
  },
  reconsiderationMsg: {
    color: "#ef4444",
    fontWeight: "bold",
    fontSize: width * 0.04,
    marginBottom: 10,
    textAlign: "center",
  },
  acceptButton: {
    backgroundColor: "#FFB46EFF",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: "center",
    marginTop: 4,
  },
  acceptButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
  },
});
