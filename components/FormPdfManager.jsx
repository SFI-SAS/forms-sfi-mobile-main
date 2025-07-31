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
  Linking,
  Platform,
  Switch,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
// Importar las librerías para descarga en móvil
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

const { width, height } = Dimensions.get("window");
const BACKEND_URL_KEY = "backend_url";

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
      console.log("[DEBUG][TEST] Consultando lista de formatos:", listUrl);
      const res = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log("[DEBUG][TEST] Status lista formatos:", res.status);
      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        console.log(
          "[DEBUG][TEST] Error parsing JSON lista formatos:",
          jsonErr
        );
        data = null;
      }
      console.log("[DEBUG][TEST] Respuesta lista formatos:", data);

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

      // Prueba: consultar el endpoint de información de un formato específico (primero del array)
      if (data.length > 0) {
        const testForm = data[0];
        const infoUrl = `${backendUrl}/list_form/forms/${testForm.id}/complete-info`;
        console.log("[DEBUG][TEST] Consultando info de formato:", infoUrl);
        const infoRes = await fetch(infoUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        console.log("[DEBUG][TEST] Status info formato:", infoRes.status);
        let infoData;
        try {
          infoData = await infoRes.json();
        } catch (jsonErr) {
          console.log(
            "[DEBUG][TEST] Error parsing JSON info formato:",
            jsonErr
          );
          infoData = null;
        }
        console.log("[DEBUG][TEST] Respuesta info formato:", infoData);
      }
    } catch (e) {
      Alert.alert("Error", "No se pudieron cargar los formatos.");
      console.log("[DEBUG][TEST] Error en fetchForms:", e);
    } finally {
      setLoading(false);
    }
  };

  // 🔥 FUNCIÓN PARA DESCARGA EN MÓVIL CON EXPO-FILE-SYSTEM
  const handleDownloadPdfMobile = async (
    formId,
    selectedQuestions = null,
    formTitle = ""
  ) => {
    try {
      console.log("[DEBUG][MOBILE] handleDownloadPdfMobile called", {
        formId,
        selectedQuestions,
        formTitle,
      });
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

      console.log("[DEBUG][MOBILE] Downloading PDF from:", url);
      console.log("[DEBUG][MOBILE] fileUri:", fileUri);

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
          console.log("[DEBUG][MOBILE] Download progress:", progress);
        }
      );

      const result = await downloadResumable.downloadAsync();
      console.log("[DEBUG][MOBILE] Download result:", result);

      // Leer el contenido del archivo descargado para debug si es pequeño
      if (result && result.uri) {
        const fileInfo = await FileSystem.getInfoAsync(result.uri);
        console.log("[DEBUG][MOBILE] File info:", fileInfo);

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
                    console.log(
                      "[DEBUG][MOBILE] Error compartiendo archivo:",
                      shareError
                    );
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
          // Si el archivo es pequeño, intenta leer el contenido para debug
          if (fileInfo.exists && fileInfo.size > 0 && fileInfo.size < 1000) {
            try {
              const content = await FileSystem.readAsStringAsync(result.uri);
              console.log(
                "[DEBUG][MOBILE] Archivo pequeño, contenido:",
                content
              );
            } catch (err) {
              console.log(
                "[DEBUG][MOBILE] Error leyendo archivo pequeño:",
                err
              );
            }
          }
          console.log(
            "[DEBUG][MOBILE] Archivo descargado vacío o muy pequeño:",
            fileInfo
          );
          throw new Error("El archivo descargado está vacío");
        }
      } else {
        console.log(
          "[DEBUG][MOBILE] No se pudo completar la descarga:",
          result
        );
        throw new Error("No se pudo completar la descarga");
      }
    } catch (error) {
      console.log("[DEBUG][MOBILE] Error en handleDownloadPdfMobile:", error);
      Alert.alert(
        "Error de descarga",
        error.message || "No se pudo descargar el PDF."
      );
    }
  };

  // 🔥 FUNCIÓN PRINCIPAL DE DESCARGA (WEB + MÓVIL) CON AUTH HEADER
  const handleDownloadPdf = async (
    formId,
    selectedQuestions = null,
    formTitle = ""
  ) => {
    try {
      console.log("[DEBUG][GENERAL] handleDownloadPdf called", {
        formId,
        selectedQuestions,
        formTitle,
      });
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

      console.log("[DEBUG][GENERAL] Download URL:", url);

      if (Platform.OS === "web") {
        console.log("[DEBUG][WEB] Platform is web, starting fetch...");
        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
        console.log("[DEBUG][WEB] Web fetch response:", response);
        if (response.ok) {
          const blob = await response.blob();
          console.log("[DEBUG][WEB] Blob size:", blob.size);
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
            // Si el blob es pequeño, intenta leerlo como texto para debug
            const text = await blob.text();
            console.log(
              "[DEBUG][WEB] Blob muy pequeño o vacío, contenido:",
              text
            );
            throw new Error("El archivo descargado está vacío o es inválido.");
          }
        } else {
          console.log(
            "[DEBUG][WEB] Web fetch error:",
            response.status,
            response.statusText
          );
          let errorText = "";
          try {
            errorText = await response.text();
          } catch {}
          console.log("[DEBUG][WEB] Error response body:", errorText);
          throw new Error("No se pudo descargar el PDF.");
        }
      } else {
        console.log(
          "[DEBUG][GENERAL] Platform is mobile, calling handleDownloadPdfMobile..."
        );
        await handleDownloadPdfMobile(formId, selectedQuestions, formTitle);
      }
    } catch (error) {
      console.log("[DEBUG][GENERAL] Error en handleDownloadPdf:", error);
      Alert.alert(
        "Error",
        error.message ||
          "No se pudo descargar el PDF. Verifica tu conexión a internet y que el formato esté disponible."
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

  // PERSONALIZACIÓN: Cargar preguntas del formulario con Authorization Bearer
  const handleOpenCustomize = async (form) => {
    try {
      console.log("[DEBUG][CUSTOMIZE] handleOpenCustomize called", { form });
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
      console.log("[DEBUG][CUSTOMIZE] Fetching complete-info:", url);
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log("[DEBUG][CUSTOMIZE] Response status:", res.status);
      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        console.log("[DEBUG][CUSTOMIZE] Error parsing JSON:", jsonErr);
        data = null;
      }
      console.log("[DEBUG][CUSTOMIZE] complete-info data:", data);

      if (res.status === 404 || (data && data.detail === "Not Found")) {
        Alert.alert(
          "Formato no disponible",
          "El formato seleccionado no existe o fue eliminado del sistema. Por favor verifica con el administrador."
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
        console.log("[DEBUG][CUSTOMIZE] Estructura recibida no válida:", data);
        Alert.alert(
          "Error",
          "No se pudieron cargar las preguntas. Estructura recibida: " +
            JSON.stringify(data)
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
      console.log(
        "[DEBUG][CUSTOMIZE] Preguntas cargadas y seleccionadas:",
        data.questions,
        selected
      );
    } catch (e) {
      console.log("[DEBUG][CUSTOMIZE] Error en handleOpenCustomize:", e);
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

  // Utilidad para convertir JSON a CSV
  function jsonToCsv(questions, selected, formData) {
    // questions: array de preguntas [{id, question_text, ...}]
    // selected: { [questionId]: true/false }
    // formData: objeto con la info completa del formato (incluye responses)
    if (!formData || !Array.isArray(formData.responses)) return "";

    // Filtrar preguntas seleccionadas
    const selectedQuestions = questions.filter((q) => selected[q.id]);
    const headers = selectedQuestions.map((q) => q.question_text);

    // Construir filas: cada response es una fila
    const rows = formData.responses.map((resp) => {
      // Para cada pregunta seleccionada, buscar la respuesta en resp.answers
      return selectedQuestions.map((q) => {
        const ans = Array.isArray(resp.answers)
          ? resp.answers.find((a) => a.question_id === q.id)
          : null;
        // Si es archivo, poner la ruta, si no el texto
        return ans
          ? ans.answer_text !== undefined && ans.answer_text !== null
            ? ans.answer_text
            : ans.file_path || ""
          : "";
      });
    });

    // Unir como CSV (separado por comas, escapando comillas)
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

  // Cambia el botón de descarga para CSV personalizado
  const handleDownloadCsv = async () => {
    try {
      setCustomizeModal((prev) => ({ ...prev, downloading: true }));
      setDownloadProgress(0);

      const backendUrl = await getBackendUrl();
      const token = await AsyncStorage.getItem("authToken");
      const url = `${backendUrl}/list_form/forms/${customizeModal.form.id}/complete-info`;
      console.log("[DEBUG][CSV] Fetching complete-info for CSV:", url);

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      console.log("[DEBUG][CSV] complete-info data:", data);

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

      // Generar CSV solo con las preguntas seleccionadas
      const csv = jsonToCsv(data.questions, customizeModal.selected, data);

      // Guardar/descargar el archivo CSV
      const fileName = `form_${customizeModal.form.id}_${(customizeModal.form.title || "formato").replace(/[^a-zA-Z0-9]/g, "_")}.csv`;

      if (Platform.OS === "web") {
        // Descargar en web
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
        // Descargar en móvil
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
      console.log("[DEBUG][CSV] Error en handleDownloadCsv:", error);
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
      <LinearGradient colors={["#f7fafc", "#e6fafd"]} style={{ flex: 1 }}>
        <View style={styles.centered}>
          <MaterialIcons name="cloud-off" size={48} color="#ef4444" />
          <Text style={styles.offlineText}>
            Debes estar conectado a internet para descargar PDF de formatos.
          </Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#f7fafc", "#e6fafd"]} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Formatos PDF</Text>
        <Text style={styles.subtitle}>
          Visualiza, descarga y personaliza los formatos disponibles.
        </Text>
        {loading ? (
          <ActivityIndicator
            size="large"
            color="#12A0AF"
            style={{ marginTop: 40 }}
          />
        ) : (
          categories.map((cat) => (
            <View key={cat.id} style={styles.categoryBox}>
              <TouchableOpacity
                style={styles.categoryHeader}
                onPress={() => handleToggleCategory(cat.id)}
                activeOpacity={0.8}
              >
                <Text style={styles.categoryTitle}>{cat.name}</Text>
                <MaterialIcons
                  name={
                    expandedCategories[cat.id] ? "expand-less" : "expand-more"
                  }
                  size={28}
                  color="#12A0AF"
                />
              </TouchableOpacity>
              {expandedCategories[cat.id] && (
                <View style={styles.formsList}>
                  {cat.forms.map((form) => (
                    <View key={form.id} style={styles.formCard}>
                      <Text style={styles.formTitle}>{form.title}</Text>
                      <Text style={styles.formDesc}>{form.description}</Text>
                      <View style={styles.formActions}>
                        <TouchableOpacity
                          style={styles.downloadBtn}
                          onPress={() =>
                            handleDownloadPdf(form.id, null, form.title)
                          }
                        >
                          <MaterialIcons
                            name="download"
                            size={22}
                            color="#fff"
                          />
                          <Text style={styles.downloadBtnText}>
                            Descargar PDF
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.customizeBtn}
                          onPress={() => handleOpenCustomize(form)}
                        >
                          <MaterialIcons
                            name="tune"
                            size={22}
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

        {/* Modal para personalizar descarga */}
        <Modal
          visible={customizeModal.visible}
          transparent
          animationType="fade"
          onRequestClose={() =>
            setCustomizeModal((prev) => ({ ...prev, visible: false }))
          }
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Personalizar descarga PDF</Text>
              <Text style={styles.modalSubtitle}>
                Selecciona las preguntas que deseas incluir:
              </Text>
              <ScrollView style={{ maxHeight: height * 0.4, width: "100%" }}>
                {customizeModal.questions.map((q) => (
                  <View key={q.id} style={styles.questionRow}>
                    <Text style={styles.questionText}>{q.question_text}</Text>
                    <Switch
                      value={!!customizeModal.selected[q.id]}
                      onValueChange={(val) =>
                        setCustomizeModal((prev) => ({
                          ...prev,
                          selected: { ...prev.selected, [q.id]: val },
                        }))
                      }
                    />
                  </View>
                ))}
              </ScrollView>

              {/* Mostrar progreso de descarga si está descargando */}
              {customizeModal.downloading && downloadProgress > 0 && (
                <View style={styles.progressContainer}>
                  <Text style={styles.progressText}>
                    Descargando... {downloadProgress}%
                  </Text>
                  <View style={styles.progressBarContainer}>
                    <View
                      style={[
                        styles.progressBar,
                        { width: `${downloadProgress}%` },
                      ]}
                    />
                  </View>
                </View>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalBtn}
                  onPress={() =>
                    handleDownloadPdf(
                      customizeModal.form.id,
                      customizeModal.selected,
                      customizeModal.form.title
                    )
                  }
                  disabled={customizeModal.downloading}
                >
                  {customizeModal.downloading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalBtnText}>Descargar PDF</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: "#2563eb" }]}
                  onPress={handleDownloadCsv}
                  disabled={customizeModal.downloading}
                >
                  {customizeModal.downloading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalBtnText}>Descargar CSV</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: "#888" }]}
                  onPress={() =>
                    setCustomizeModal((prev) => ({ ...prev, visible: false }))
                  }
                  disabled={customizeModal.downloading}
                >
                  <Text style={styles.modalBtnText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: width * 0.06,
    paddingBottom: 40,
    minHeight: height,
  },
  title: {
    fontSize: width * 0.06,
    fontWeight: "bold",
    color: "#4B34C7",
    marginBottom: 4,
    textAlign: "center",
  },
  subtitle: {
    fontSize: width * 0.04,
    color: "#12A0AF",
    marginBottom: 18,
    textAlign: "center",
  },
  categoryBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 18,
    borderWidth: 1.5,
    borderColor: "#12A0AF",
    shadowColor: "#12A0AF",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  categoryTitle: {
    fontWeight: "bold",
    fontSize: width * 0.045,
    color: "#12A0AF",
  },
  formsList: {
    padding: 10,
  },
  formCard: {
    backgroundColor: "#f7fafc",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#12A0AF",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  formTitle: {
    fontWeight: "bold",
    fontSize: width * 0.042,
    color: "#4B34C7",
    marginBottom: 2,
  },
  formDesc: {
    fontSize: width * 0.035,
    color: "#12A0AF",
    marginBottom: 8,
  },
  formActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  downloadBtn: {
    backgroundColor: "#12A0AF",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
  },
  downloadBtnText: {
    color: "#fff",
    fontWeight: "bold",
    marginLeft: 6,
    fontSize: 15,
  },
  customizeBtn: {
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#12A0AF",
  },
  customizeBtnText: {
    color: "#12A0AF",
    fontWeight: "bold",
    marginLeft: 6,
    fontSize: 15,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  offlineText: {
    color: "#ef4444",
    fontWeight: "bold",
    fontSize: width * 0.045,
    marginTop: 18,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 22,
    width: "88%",
    alignItems: "center",
    elevation: 6,
  },
  modalTitle: {
    fontWeight: "bold",
    fontSize: width * 0.05,
    color: "#4B34C7",
    marginBottom: 8,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: width * 0.038,
    color: "#12A0AF",
    marginBottom: 10,
    textAlign: "center",
  },
  questionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  questionText: {
    color: "#222",
    fontSize: width * 0.038,
    flex: 1,
    marginRight: 8,
  },
  // 🔥 NUEVOS ESTILOS PARA LA BARRA DE PROGRESO
  progressContainer: {
    width: "100%",
    marginTop: 15,
    marginBottom: 10,
  },
  progressText: {
    textAlign: "center",
    color: "#12A0AF",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: "#e5e7eb",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#12A0AF",
    borderRadius: 4,
  },
  modalActions: {
    flexDirection: "row",
    marginTop: 18,
    gap: 10,
    width: "100%",
    justifyContent: "space-between",
  },
  modalBtn: {
    backgroundColor: "#12A0AF",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: "center",
    flex: 1,
    marginHorizontal: 4,
  },
  modalBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
    textAlign: "center",
  },
  categoryBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 18,
    borderWidth: 1.5,
    borderColor: "#12A0AF",
    shadowColor: "#12A0AF",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  categoryTitle: {
    fontWeight: "bold",
    fontSize: width * 0.045,
    color: "#12A0AF",
  },
  formsList: {
    padding: 10,
  },
  formCard: {
    backgroundColor: "#f7fafc",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#12A0AF",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  formTitle: {
    fontWeight: "bold",
    fontSize: width * 0.042,
    color: "#4B34C7",
    marginBottom: 2,
  },
  formDesc: {
    fontSize: width * 0.035,
    color: "#12A0AF",
    marginBottom: 8,
  },
  formActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  downloadBtn: {
    backgroundColor: "#12A0AF",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
  },
  downloadBtnText: {
    color: "#fff",
    fontWeight: "bold",
    marginLeft: 6,
    fontSize: 15,
  },
  customizeBtn: {
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#12A0AF",
  },
  customizeBtnText: {
    color: "#12A0AF",
    fontWeight: "bold",
    marginLeft: 6,
    fontSize: 15,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  offlineText: {
    color: "#ef4444",
    fontWeight: "bold",
    fontSize: width * 0.045,
    marginTop: 18,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 22,
    width: "88%",
    alignItems: "center",
    elevation: 6,
  },
  modalTitle: {
    fontWeight: "bold",
    fontSize: width * 0.05,
    color: "#4B34C7",
    marginBottom: 8,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: width * 0.038,
    color: "#12A0AF",
    marginBottom: 10,
    textAlign: "center",
  },
  questionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  questionText: {
    color: "#222",
    fontSize: width * 0.038,
    flex: 1,
    marginRight: 8,
  },
  // 🔥 NUEVOS ESTILOS PARA LA BARRA DE PROGRESO
  progressContainer: {
    width: "100%",
    marginTop: 15,
    marginBottom: 10,
  },
  progressText: {
    textAlign: "center",
    color: "#12A0AF",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: "#e5e7eb",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#12A0AF",
    borderRadius: 4,
  },
  modalActions: {
    flexDirection: "row",
    marginTop: 18,
    gap: 10,
    width: "100%",
    justifyContent: "space-between",
  },
  modalBtn: {
    backgroundColor: "#12A0AF",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: "center",
    flex: 1,
    marginHorizontal: 4,
  },
  modalBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
    textAlign: "center",
  },
});
