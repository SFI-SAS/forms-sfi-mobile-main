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
import * as FileSystem from "expo-file-system";
import * as Permissions from "expo-permissions";
import * as MediaLibrary from "expo-media-library";

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
  const [downloadProgress, setDownloadProgress] = useState(0); // 0-1
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
      const res = await fetch(`${backendUrl}/forms/all/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      console.log("DEBUG: formatos recibidos del backend:", data); // <-- DEBUG
      if (!Array.isArray(data))
        throw new Error("No se pudieron cargar los formatos.");
      setForms(data);

      // Agrupar por categoría
      const catMap = {};
      data.forEach((form) => {
        const catId = form.category?.id || "no-category";
        const catName = form.category?.name || "Sin Categoría";
        if (!catMap[catId])
          catMap[catId] = { id: catId, name: catName, forms: [] };
        catMap[catId].forms.push(form);
      });
      console.log("DEBUG: categorías agrupadas:", catMap); // <-- DEBUG
      setCategories(Object.values(catMap));
    } catch (e) {
      console.error("DEBUG: error trayendo formatos:", e); // <-- DEBUG
      Alert.alert("Error", "No se pudieron cargar los formatos.");
    } finally {
      setLoading(false);
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
        const qIds = Object.keys(selectedQuestions)
          .filter((qid) => selectedQuestions[qid])
          .join(",");
        if (qIds.length > 0) {
          url += `?questions=${qIds}`;
        }
      }

      if (Platform.OS === "web") {
        // Descarga directa en web usando blob
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.setAttribute(
          "download",
          `form_${formId}_${(formTitle || "formato").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`
        );
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);
      } else {
        // Solicitar permisos de almacenamiento y descargas
        let storageGranted = true;
        let downloadsGranted = true;
        const { status: storageStatus } =
          await MediaLibrary.requestPermissionsAsync();
        if (storageStatus !== "granted") {
          storageGranted = false;
        }
        if (!storageGranted) {
          Alert.alert(
            "Permiso requerido",
            "Se requiere permiso de almacenamiento para guardar el PDF."
          );
          setCustomizeModal((prev) => ({
            ...prev,
            downloading: false,
            visible: false,
          }));
          return;
        }
        // Descargar directamente a la carpeta de documentos de la app y mover a Descargas del sistema
        const fileName = `form_${formId}_${(formTitle || "formato").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
        // Usa cacheDirectory para evitar problemas de permisos con MediaLibrary
        const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
        const downloadRes = await FileSystem.downloadAsync(url, fileUri, {
          headers: { Authorization: `Bearer ${token}` },
          onDownloadProgress: (progress) => {
            if (progress && progress.totalBytesExpectedToWrite > 0) {
              setDownloadProgress(
                progress.totalBytesWritten / progress.totalBytesExpectedToWrite
              );
            }
          },
          onDownloadProgressInterval: 100,
        });
        if (!downloadRes || !downloadRes.uri) {
          throw new Error("No se pudo descargar el archivo PDF (móvil)");
        }
        try {
          // Solución: asegúrate de que el archivo exista y tenga extensión .pdf
          // Verifica que el archivo realmente existe antes de crear el asset
          const fileInfo = await FileSystem.getInfoAsync(downloadRes.uri);
          if (!fileInfo.exists) {
            throw new Error("El archivo PDF no existe en la ruta esperada.");
          }
          // MediaLibrary solo acepta archivos en cacheDirectory/documentDirectory y con extensión válida
          // Si sigue fallando, intenta copiar el archivo a documentDirectory y luego crear el asset
          let asset;
          try {
            asset = await MediaLibrary.createAssetAsync(downloadRes.uri);
          } catch (err) {
            // Fallback: copiar a documentDirectory y reintentar
            const destUri = `${FileSystem.documentDirectory}${fileName}`;
            await FileSystem.copyAsync({ from: downloadRes.uri, to: destUri });
            asset = await MediaLibrary.createAssetAsync(destUri);
          }
          let downloads = await MediaLibrary.getAlbumAsync("Download");
          if (!downloads) {
            downloads = await MediaLibrary.createAlbumAsync(
              "Download",
              asset,
              false
            );
          } else {
            await MediaLibrary.addAssetsToAlbumAsync([asset], downloads, false);
          }
          Alert.alert(
            "Descarga completa",
            `El PDF se guardó en la carpeta Descargas del dispositivo.`
          );
        } catch (err) {
          // Si sigue fallando, muestra la ruta local para que el usuario pueda abrir el archivo manualmente
          console.error("❌ Error creando asset en MediaLibrary:", err);
          Alert.alert(
            "Descarga completa",
            `El PDF se descargó pero no se pudo mover a la carpeta Descargas. Puedes abrirlo desde: ${downloadRes.uri}`
          );
        }
      }
    } catch (e) {
      Alert.alert("Error", "No se pudo descargar el PDF.");
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
      // Obtener preguntas del formulario
      const backendUrl = await getBackendUrl();
      const token = await AsyncStorage.getItem("authToken");
      const res = await fetch(`${backendUrl}/forms/${form.id}/complete-info`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      console.log("DEBUG: /forms/{id}/complete-info response:", data);
      if (!data || typeof data !== "object") {
        Alert.alert("Error", "Respuesta inesperada del backend.");
        setCustomizeModal({
          visible: false,
          form: null,
          questions: [],
          selected: {},
          downloading: false,
        });
        return;
      }
      if (!Array.isArray(data.questions)) {
        // Mostrar la estructura recibida para debug
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
      // Por defecto, selecciona todas las preguntas
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
      console.error("❌ Error en handleOpenCustomize:", e);
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

        {/* Barra de progreso de descarga */}
        {customizeModal.downloading && downloadProgress > 0 && (
          <View style={{ width: "100%", marginTop: 18, alignItems: "center" }}>
            <View
              style={{
                width: "90%",
                height: 8,
                backgroundColor: "#e5e7eb",
                borderRadius: 6,
                overflow: "hidden",
                marginBottom: 8,
              }}
            >
              <View
                style={{
                  width: `${Math.round(downloadProgress * 100)}%`,
                  height: "100%",
                  backgroundColor: "#12A0AF",
                }}
              />
            </View>
            <Text style={{ color: "#12A0AF", fontWeight: "bold" }}>
              Descargando... {Math.round(downloadProgress * 100)}%
            </Text>
          </View>
        )}
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
  modalBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
    textAlign: "center",
  },
});
