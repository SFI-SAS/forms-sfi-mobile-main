import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Dimensions,
  ActivityIndicator,
  Alert,
  Platform,
  Switch,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

const { width, height } = Dimensions.get("window");
const BACKEND_URL_KEY = "backend_url";

// Utilidad para hacer el diseño más responsive
const scale = width / 375; // Base: iPhone X width
const normalize = (size) => {
  const newSize = size * scale;
  return Math.round(newSize);
};

const getBackendUrl = async () => {
  const stored = await AsyncStorage.getItem(BACKEND_URL_KEY);
  return stored || "";
};

export default function FormPdfManager() {
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState([]);
  const [isOnline, setIsOnline] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [customizeModal, setCustomizeModal] = useState({
    visible: false,
    form: null,
    questions: [],
    selected: {},
    downloading: false,
  });
  const [categories, setCategories] = useState([]);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const checkNet = async () => {
      const net = await NetInfo.fetch();
      setIsOnline(net.isConnected);
    };
    checkNet();
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isOnline) {
      setLoading(false);
      return;
    }
    fetchForms();
  }, [isOnline]);

  const fetchForms = async () => {
    setLoading(true);
    try {
      const backendUrl = await getBackendUrl();
      const token = await AsyncStorage.getItem("authToken");
      const listUrl = `${backendUrl}/forms/all/list`;
      const res = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        data = null;
      }

      if (!Array.isArray(data))
        throw new Error("No se pudieron cargar los formatos.");
      setForms(data);

      const catMap = {};
      data.forEach((form) => {
        const catId = form.category?.id || "no-category";
        const catName = form.category?.name || "Sin Categoría";
        if (!catMap[catId])
          catMap[catId] = { id: catId, name: catName, forms: [] };
        catMap[catId].forms.push(form);
      });
      setCategories(Object.values(catMap));
    } catch (e) {
      Alert.alert("Error", "No se pudieron cargar los formatos.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdfMobile = async (
    formId,
    selectedQuestions = null,
    formTitle = ""
  ) => {
    try {
      const backendUrl = await getBackendUrl();
      const token = await AsyncStorage.getItem("authToken");
      let url = `${backendUrl}/users/forms/${formId}/pdf`;

      if (selectedQuestions && Object.keys(selectedQuestions).length > 0) {
        const qIds = Object.keys(selectedQuestions).filter(
          (qid) => selectedQuestions[qid]
        );
        if (qIds.length > 0) {
          url += `?questions=${qIds.join(",")}`;
        }
      }

      const fileName = `form_${formId}_${formTitle.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
      const fileUri = FileSystem.documentDirectory + fileName;

      const downloadResumable = FileSystem.createDownloadResumable(
        url,
        fileUri,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
        (downloadProgress) => {
          const progress =
            downloadProgress.totalBytesWritten /
            downloadProgress.totalBytesExpectedToWrite;
          setDownloadProgress(Math.round(progress * 100));
        }
      );

      const result = await downloadResumable.downloadAsync();

      if (result && result.uri) {
        const fileInfo = await FileSystem.getInfoAsync(result.uri);

        if (fileInfo.exists && fileInfo.size > 1000) {
          Alert.alert(
            "¡Descarga exitosa!",
            `PDF descargado correctamente (${Math.round(fileInfo.size / 1024)} KB)`,
            [
              {
                text: "Abrir/Compartir",
                onPress: async () => {
                  try {
                    if (await Sharing.isAvailableAsync()) {
                      await Sharing.shareAsync(result.uri, {
                        mimeType: "application/pdf",
                        dialogTitle: `${formTitle} - PDF`,
                      });
                    } else {
                      Alert.alert(
                        "Archivo guardado",
                        `PDF guardado en: ${result.uri}`
                      );
                    }
                  } catch (shareError) {
                    Alert.alert(
                      "Archivo guardado",
                      `PDF guardado en: ${result.uri}`
                    );
                  }
                },
              },
              {
                text: "OK",
                style: "default",
              },
            ]
          );
        } else {
          throw new Error("El archivo descargado está vacío");
        }
      } else {
        throw new Error("No se pudo completar la descarga");
      }
    } catch (error) {
      Alert.alert(
        "Error de descarga",
        error.message || "No se pudo descargar el PDF."
      );
    }
  };

  const handleDownloadPdf = async (
    formId,
    selectedQuestions = null,
    formTitle = ""
  ) => {
    try {
      setCustomizeModal((prev) => ({ ...prev, downloading: true }));
      setDownloadProgress(0);

      const backendUrl = await getBackendUrl();
      const token = await AsyncStorage.getItem("authToken");
      let url = `${backendUrl}/forms/${formId}/pdf`;

      if (selectedQuestions && Object.keys(selectedQuestions).length > 0) {
        const qIds = Object.keys(selectedQuestions).filter(
          (qid) => selectedQuestions[qid]
        );
        if (qIds.length > 0) {
          url += `?questions=${qIds.join(",")}`;
        }
      }

      if (Platform.OS === "web") {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
        if (response.ok) {
          const blob = await response.blob();
          if (blob.size > 1000) {
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = downloadUrl;
            link.setAttribute(
              "download",
              `form_${formId}_${formTitle.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`
            );
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(downloadUrl);
            Alert.alert("Éxito", "PDF descargado correctamente");
          } else {
            throw new Error("El archivo descargado está vacío o es inválido.");
          }
        } else {
          throw new Error("No se pudo descargar el PDF.");
        }
      } else {
        await handleDownloadPdfMobile(formId, selectedQuestions, formTitle);
      }
    } catch (error) {
      Alert.alert(
        "Error",
        error.message ||
          "No se pudo descargar el PDF. Verifica tu conexión a internet."
      );
    } finally {
      setCustomizeModal((prev) => ({
        ...prev,
        downloading: false,
        visible: false,
      }));
      setDownloadProgress(0);
    }
  };

  const handleOpenCustomize = async (form) => {
    try {
      setCustomizeModal({
        visible: true,
        form,
        questions: [],
        selected: {},
        downloading: false,
      });
      const backendUrl = await getBackendUrl();
      const token = await AsyncStorage.getItem("authToken");
      const url = `${backendUrl}/list_form/forms/${form.id}/complete-info`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        data = null;
      }

      if (res.status === 404 || (data && data.detail === "Not Found")) {
        Alert.alert(
          "Formato no disponible",
          "El formato seleccionado no existe o fue eliminado del sistema."
        );
        setCustomizeModal({
          visible: false,
          form: null,
          questions: [],
          selected: {},
          downloading: false,
        });
        return;
      }

      if (!data || typeof data !== "object" || !Array.isArray(data.questions)) {
        Alert.alert("Error", "No se pudieron cargar las preguntas.");
        setCustomizeModal({
          visible: false,
          form: null,
          questions: [],
          selected: {},
          downloading: false,
        });
        return;
      }
      const selected = {};
      data.questions.forEach((q) => {
        selected[q.id] = true;
      });
      setCustomizeModal({
        visible: true,
        form,
        questions: data.questions,
        selected,
        downloading: false,
      });
    } catch (e) {
      Alert.alert("Error", "No se pudieron cargar las preguntas.");
      setCustomizeModal({
        visible: false,
        form: null,
        questions: [],
        selected: {},
        downloading: false,
      });
    }
  };

  const handleToggleCategory = (catId) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  function jsonToCsv(questions, selected, formData) {
    if (!formData || !Array.isArray(formData.responses)) return "";
    const selectedQuestions = questions.filter((q) => selected[q.id]);
    const headers = selectedQuestions.map((q) => q.question_text);
    const rows = formData.responses.map((resp) => {
      return selectedQuestions.map((q) => {
        const ans = Array.isArray(resp.answers)
          ? resp.answers.find((a) => a.question_id === q.id)
          : null;
        return ans
          ? ans.answer_text !== undefined && ans.answer_text !== null
            ? ans.answer_text
            : ans.file_path || ""
          : "";
      });
    });
    const escape = (val) =>
      typeof val === "string"
        ? `"${val.replace(/"/g, '""')}"`
        : val === null || val === undefined
          ? ""
          : String(val);
    const csv =
      headers.map(escape).join(",") +
      "\n" +
      rows.map((row) => row.map(escape).join(",")).join("\n");
    return csv;
  }

  const handleDownloadCsv = async () => {
    try {
      setCustomizeModal((prev) => ({ ...prev, downloading: true }));
      setDownloadProgress(0);

      const backendUrl = await getBackendUrl();
      const token = await AsyncStorage.getItem("authToken");
      const url = `${backendUrl}/list_form/forms/${customizeModal.form.id}/complete-info`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (
        !data ||
        !Array.isArray(data.questions) ||
        !Array.isArray(data.responses)
      ) {
        Alert.alert(
          "Error",
          "No se pudo obtener la información del formato para exportar CSV."
        );
        setCustomizeModal((prev) => ({
          ...prev,
          downloading: false,
          visible: false,
        }));
        return;
      }

      const csv = jsonToCsv(data.questions, customizeModal.selected, data);
      const fileName = `form_${customizeModal.form.id}_${(customizeModal.form.title || "formato").replace(/[^a-zA-Z0-9]/g, "_")}.csv`;

      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv" });
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);
        Alert.alert("Éxito", "CSV descargado correctamente");
      } else {
        const fileUri = FileSystem.documentDirectory + fileName;
        await FileSystem.writeAsStringAsync(fileUri, csv, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: "text/csv",
            dialogTitle: `${customizeModal.form.title} - CSV`,
          });
        } else {
          Alert.alert("Archivo guardado", `CSV guardado en: ${fileUri}`);
        }
      }
    } catch (error) {
      Alert.alert("Error", "No se pudo descargar el CSV.");
    } finally {
      setCustomizeModal((prev) => ({
        ...prev,
        downloading: false,
        visible: false,
      }));
      setDownloadProgress(0);
    }
  };

  if (!isOnline) {
    return (
      <LinearGradient colors={["#f0f9ff", "#e0f2fe"]} style={{ flex: 1 }}>
        <View style={styles.centered}>
          <View style={styles.offlineIconContainer}>
            <MaterialIcons name="cloud-off" size={normalize(64)} color="#ef4444" />
          </View>
          <Text style={styles.offlineTitle}>Sin conexión</Text>
          <Text style={styles.offlineText}>
            Debes estar conectado a internet para descargar formatos PDF.
          </Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#f0f9ff", "#e0f2fe"]} style={{ flex: 1 }}>
      <ScrollView 
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerIconContainer}>
            <MaterialIcons name="picture-as-pdf" size={normalize(36)} color="#12A0AF" />
          </View>
          <Text style={styles.title}>Formatos PDF</Text>
          <Text style={styles.subtitle}>
            Visualiza, descarga y personaliza los formatos disponibles
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#12A0AF" />
            <Text style={styles.loadingText}>Cargando formatos...</Text>
          </View>
        ) : (
          categories.map((cat) => (
            <View key={cat.id} style={styles.categoryBox}>
              <TouchableOpacity
                style={styles.categoryHeader}
                onPress={() => handleToggleCategory(cat.id)}
                activeOpacity={0.7}
              >
                <View style={styles.categoryHeaderContent}>
                  <MaterialIcons
                    name="folder"
                    size={normalize(24)}
                    color="#12A0AF"
                    style={styles.categoryIcon}
                  />
                  <Text style={styles.categoryTitle}>{cat.name}</Text>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryBadgeText}>{cat.forms.length}</Text>
                  </View>
                </View>
                <MaterialIcons
                  name={
                    expandedCategories[cat.id] ? "expand-less" : "expand-more"
                  }
                  size={normalize(28)}
                  color="#12A0AF"
                />
              </TouchableOpacity>
              {expandedCategories[cat.id] && (
                <View style={styles.formsList}>
                  {cat.forms.map((form) => (
                    <View key={form.id} style={styles.formCard}>
                      <View style={styles.formHeader}>
                        <MaterialIcons
                          name="description"
                          size={normalize(20)}
                          color="#4B34C7"
                        />
                        <Text style={styles.formTitle} numberOfLines={2}>
                          {form.title}
                        </Text>
                      </View>
                      {form.description && (
                        <Text style={styles.formDesc} numberOfLines={3}>
                          {form.description}
                        </Text>
                      )}
                      <View style={styles.formActions}>
                        <TouchableOpacity
                          style={styles.downloadBtn}
                          onPress={() =>
                            handleDownloadPdf(form.id, null, form.title)
                          }
                          activeOpacity={0.8}
                        >
                          <MaterialIcons
                            name="download"
                            size={normalize(20)}
                            color="#fff"
                          />
                          <Text style={styles.downloadBtnText}>
                            Descargar
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.customizeBtn}
                          onPress={() => handleOpenCustomize(form)}
                          activeOpacity={0.8}
                        >
                          <MaterialIcons
                            name="tune"
                            size={normalize(20)}
                            color="#12A0AF"
                          />
                          <Text style={styles.customizeBtnText}>
                            Personalizar
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Modal de personalización */}
      <Modal
        visible={customizeModal.visible}
        transparent
        animationType="slide"
        onRequestClose={() =>
          !customizeModal.downloading &&
          setCustomizeModal((prev) => ({ ...prev, visible: false }))
        }
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <MaterialIcons
                name="tune"
                size={normalize(28)}
                color="#4B34C7"
              />
              <Text style={styles.modalTitle}>Personalizar descarga</Text>
            </View>
            
            <Text style={styles.modalSubtitle}>
              Selecciona las preguntas que deseas incluir:
            </Text>

            <ScrollView 
              style={styles.questionsList}
              showsVerticalScrollIndicator={false}
            >
              {customizeModal.questions.map((q, index) => (
                <View key={q.id} style={styles.questionRow}>
                  <View style={styles.questionContent}>
                    <View style={styles.questionNumber}>
                      <Text style={styles.questionNumberText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.questionText} numberOfLines={2}>
                      {q.question_text}
                    </Text>
                  </View>
                  <Switch
                    value={!!customizeModal.selected[q.id]}
                    onValueChange={(val) =>
                      setCustomizeModal((prev) => ({
                        ...prev,
                        selected: { ...prev.selected, [q.id]: val },
                      }))
                    }
                    trackColor={{ false: "#d1d5db", true: "#7dd3fc" }}
                    thumbColor={customizeModal.selected[q.id] ? "#12A0AF" : "#f3f4f6"}
                    disabled={customizeModal.downloading}
                  />
                </View>
              ))}
            </ScrollView>

            {/* Indicador de descarga */}
            {customizeModal.downloading && (
              <View style={styles.downloadingContainer}>
                <ActivityIndicator size="large" color="#12A0AF" />
                <Text style={styles.downloadingText}>
                  {downloadProgress > 0 && downloadProgress < 100
                    ? `Descargando... ${downloadProgress}%`
                    : "Preparando descarga..."}
                </Text>
                {downloadProgress > 0 && downloadProgress < 100 && (
                  <View style={styles.progressBarContainer}>
                    <View
                      style={[
                        styles.progressBar,
                        { width: `${downloadProgress}%` },
                      ]}
                    />
                  </View>
                )}
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.csvBtn]}
                onPress={handleDownloadCsv}
                disabled={customizeModal.downloading}
                activeOpacity={0.8}
              >
                <MaterialIcons
                  name="table-chart"
                  size={normalize(20)}
                  color="#fff"
                />
                <Text style={styles.modalBtnText}>CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() =>
                  setCustomizeModal((prev) => ({ ...prev, visible: false }))
                }
                disabled={customizeModal.downloading}
                activeOpacity={0.8}
              >
                <MaterialIcons
                  name="close"
                  size={normalize(20)}
                  color="#6b7280"
                />
                <Text style={[styles.modalBtnText, { color: "#6b7280" }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: width * 0.05,
    paddingBottom: normalize(40),
  },
  header: {
    alignItems: "center",
    marginBottom: normalize(24),
    paddingTop: normalize(16),
  },
  headerIconContainer: {
    width: normalize(80),
    height: normalize(80),
    borderRadius: normalize(40),
    backgroundColor: "rgba(18, 160, 175, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: normalize(12),
  },
  title: {
    fontSize: normalize(28),
    fontWeight: "bold",
    color: "#4B34C7",
    marginBottom: normalize(6),
    textAlign: "center",
  },
  subtitle: {
    fontSize: normalize(14),
    color: "#12A0AF",
    textAlign: "center",
    paddingHorizontal: normalize(20),
    lineHeight: normalize(20),
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: normalize(60),
  },
  loadingText: {
    marginTop: normalize(16),
    fontSize: normalize(16),
    color: "#12A0AF",
    fontWeight: "500",
  },
  categoryBox: {
    backgroundColor: "#fff",
    borderRadius: normalize(16),
    marginBottom: normalize(16),
    overflow: "hidden",
    shadowColor: "#12A0AF",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: normalize(16),
    backgroundColor: "rgba(18, 160, 175, 0.05)",
  },
  categoryHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  categoryIcon: {
    marginRight: normalize(10),
  },
  categoryTitle: {
    fontWeight: "700",
    fontSize: normalize(16),
    color: "#12A0AF",
    flex: 1,
  },
  categoryBadge: {
    backgroundColor: "#12A0AF",
    borderRadius: normalize(12),
    paddingHorizontal: normalize(10),
    paddingVertical: normalize(4),
    marginLeft: normalize(8),
  },
  categoryBadgeText: {
    color: "#fff",
    fontSize: normalize(12),
    fontWeight: "700",
  },
  formsList: {
    padding: normalize(12),
  },
  formCard: {
    backgroundColor: "#fafafa",
    borderRadius: normalize(12),
    padding: normalize(14),
    marginBottom: normalize(10),
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: normalize(8),
  },
  formTitle: {
    fontWeight: "700",
    fontSize: normalize(15),
    color: "#4B34C7",
    flex: 1,
    marginLeft: normalize(8),
  },
  formDesc: {
    fontSize: normalize(13),
    color: "#6b7280",
    marginBottom: normalize(12),
    lineHeight: normalize(18),
  },
  formActions: {
    flexDirection: "row",
    gap: normalize(10),
  },
  downloadBtn: {
    backgroundColor: "#12A0AF",
    borderRadius: normalize(10),
    paddingVertical: normalize(10),
    paddingHorizontal: normalize(16),
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    shadowColor: "#12A0AF",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  downloadBtnText: {
    color: "#fff",
    fontWeight: "700",
    marginLeft: normalize(6),
    fontSize: normalize(14),
  },
  customizeBtn: {
    backgroundColor: "#fff",
    borderRadius: normalize(10),
    paddingVertical: normalize(10),
    paddingHorizontal: normalize(16),
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#12A0AF",
  },
  customizeBtnText: {
    color: "#12A0AF",
    fontWeight: "700",
    marginLeft: normalize(6),
    fontSize: normalize(14),
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: normalize(40),
  },
  offlineIconContainer: {
    width: normalize(120),
    height: normalize(120),
    borderRadius: normalize(60),
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: normalize(20),
  },
  offlineTitle: {
    fontSize: normalize(24),
    fontWeight: "bold",
    color: "#ef4444",
    marginBottom: normalize(8),
  },
  offlineText: {
    color: "#6b7280",
    fontSize: normalize(16),
    textAlign: "center",
    lineHeight: normalize(24),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: normalize(24),
    borderTopRightRadius: normalize(24),
    padding: normalize(20),
    maxHeight: height * 0.85,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: normalize(16),
    paddingBottom: normalize(12),
    borderBottomWidth: 2,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontWeight: "700",
    fontSize: normalize(20),
    color: "#4B34C7",
    marginLeft: normalize(10),
  },
  modalSubtitle: {
    fontSize: normalize(14),
    color: "#6b7280",
    marginBottom: normalize(16),
    textAlign: "center",
  },
  questionsList: {
    maxHeight: height * 0.4,
    marginBottom: normalize(16),
  },
  questionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: normalize(12),
    paddingHorizontal: normalize(8),
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  questionContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: normalize(12),
  },
  questionNumber: {
    width: normalize(28),
    height: normalize(28),
    borderRadius: normalize(14),
    backgroundColor: "#e0f2fe",
    alignItems: "center",
    justifyContent: "center",
    marginRight: normalize(10),
  },
  questionNumberText: {
    fontSize: normalize(12),
    fontWeight: "700",
    color: "#12A0AF",
  },
  questionText: {
    color: "#374151",
    fontSize: normalize(14),
    flex: 1,
    lineHeight: normalize(20),
  },
  downloadingContainer: {
    backgroundColor: "#f0f9ff",
    borderRadius: normalize(12),
    padding: normalize(20),
    alignItems: "center",
    marginBottom: normalize(16),
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  downloadingText: {
    textAlign: "center",
    color: "#0369a1",
    fontSize: normalize(16),
    fontWeight: "600",
    marginTop: normalize(12),
  },
  progressBarContainer: {
    width: "100%",
    height: normalize(8),
    backgroundColor: "#e0f2fe",
    borderRadius: normalize(4),
    overflow: "hidden",
    marginTop: normalize(12),
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#12A0AF",
    borderRadius: normalize(4),
  },
  modalActions: {
    flexDirection: "row",
    gap: normalize(12),
  },
  modalBtn: {
    borderRadius: normalize(12),
    paddingVertical: normalize(14),
    paddingHorizontal: normalize(20),
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    flexDirection: "row",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  csvBtn: {
    backgroundColor: "#2563eb",
  },
  cancelBtn: {
    backgroundColor: "#f3f4f6",
  },
  modalBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: normalize(15),
    marginLeft: normalize(8),
  },
});