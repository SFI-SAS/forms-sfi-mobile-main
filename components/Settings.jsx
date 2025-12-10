import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Appearance,
  useColorScheme,
  ScrollView,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import NetInfo from "@react-native-community/netinfo";
import LogViewer from "./LogViewer";
import crashlyticsService from "../services/crashlytics";
import {
  getCacheStats,
  clearManagedCache,
  cleanExpiredCache,
} from "../utils/cacheManager";

const BACKEND_URL_KEY = "backend_url";
const USER_INFO_KEY = "user_info_offline";
const THEME_KEY = "app_theme"; // Nuevo: clave para guardar el tema
const USER_UPDATE_PENDING_KEY = "user_update_pending";

export default function Settings() {
  const [backendUrl, setBackendUrl] = useState("");
  const [input, setInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null); // null | "ok" | "fail"
  const [checkMsg, setCheckMsg] = useState("");
  const [userInfo, setUserInfo] = useState(null);
  const [editUser, setEditUser] = useState(false);
  const [userDraft, setUserDraft] = useState({});
  const [theme, setTheme] = useState("light");
  const [loadingUserUpdate, setLoadingUserUpdate] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [cacheStats, setCacheStats] = useState(null);
  const [loadingCache, setLoadingCache] = useState(false);
  const colorScheme = useColorScheme();
  const router = useRouter();

  useEffect(() => {
    AsyncStorage.getItem(BACKEND_URL_KEY).then((url) => {
      setBackendUrl(url || "");
      setInput(url || "");
    });
  }, []);

  // Cargar datos de usuario offline al entrar
  useFocusEffect(
    React.useCallback(() => {
      const loadUser = async () => {
        const stored = await AsyncStorage.getItem(USER_INFO_KEY);
        if (stored) {
          setUserInfo(JSON.parse(stored));
          setUserDraft(JSON.parse(stored));
        }
      };
      loadUser();
    }, [])
  );

  // Cargar tema guardado o usar sistema
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((savedTheme) => {
      if (savedTheme) setTheme(savedTheme);
      else setTheme(colorScheme || "light");
    });
  }, [colorScheme]);

  // Sync pending user update when online
  useEffect(() => {
    const syncPendingUserUpdate = async () => {
      const net = await NetInfo.fetch();
      if (!net.isConnected) return;
      const pending = await AsyncStorage.getItem(USER_UPDATE_PENDING_KEY);
      if (!pending) return;
      try {
        setLoadingUserUpdate(true);
        const backendUrl = await AsyncStorage.getItem(BACKEND_URL_KEY);
        const token = await AsyncStorage.getItem("authToken");
        if (!backendUrl || !token) return;
        const body = JSON.parse(pending);
        const res = await fetch(`${backendUrl}/users/info/update-profile`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          await AsyncStorage.removeItem(USER_UPDATE_PENDING_KEY);
          await AsyncStorage.setItem(USER_INFO_KEY, JSON.stringify(body));
          setUserInfo(body);
          setUserDraft(body);
          Alert.alert("Success", "User data updated online.");
        }
      } catch (e) {
        // keep pending if fails
      } finally {
        setLoadingUserUpdate(false);
      }
    };
    syncPendingUserUpdate();
  }, []);

  // Validación básica de URL
  const isValidUrl = (url) => {
    try {
      const u = new URL(url);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  };

  // Save backend URL, only if online
  const handleSave = async () => {
    const net = await NetInfo.fetch();
    if (!net.isConnected) {
      Alert.alert(
        "No connection",
        "This function is not available right now. Internet connection is required."
      );
      return;
    }
    let url = input.trim();
    if (!/^https?:\/\//.test(url)) {
      url = "https://" + url;
    }
    if (!isValidUrl(url)) {
      Alert.alert("Invalid URL", "Please enter a valid URL (https://...)");
      return;
    }
    await AsyncStorage.setItem(BACKEND_URL_KEY, url);
    setBackendUrl(url);
    setInput(url);
    setCheckResult(null);
    Alert.alert("Saved", "Backend URL updated.");
  };

  // Check backend URL, only if online
  const handleCheck = async () => {
    const net = await NetInfo.fetch();
    if (!net.isConnected) {
      setCheckResult("fail");
      setCheckMsg(
        "This function is not available right now. Internet connection is required."
      );
      return;
    }
    let url = input.trim();
    if (!/^https?:\/\//.test(url)) {
      url = "https://" + url;
    }
    if (!isValidUrl(url)) {
      setCheckResult("fail");
      setCheckMsg("Invalid URL format.");
      return;
    }
    setChecking(true);
    setCheckResult(null);
    setCheckMsg("");
    try {
      // Intenta /health o /docs o /
      let testUrl = url.replace(/\/+$/, "");
      let res = await fetch(testUrl + "/health", { method: "GET" });
      if (!res.ok) {
        // Intenta /docs
        res = await fetch(testUrl + "/docs", { method: "GET" });
      }
      if (!res.ok) {
        // Intenta /
        res = await fetch(testUrl + "/", { method: "GET" });
      }
      if (res.ok) {
        setCheckResult("ok");
        setCheckMsg("Connection successful!");
      } else {
        setCheckResult("fail");
        setCheckMsg("Server responded but not healthy.");
      }
    } catch (e) {
      setCheckResult("fail");
      setCheckMsg("Could not connect to server.");
    } finally {
      setChecking(false);
    }
  };

  // Save user data, try online, fallback to local if offline or error
  const handleSaveUser = async () => {
    setLoadingUserUpdate(true);
    const net = await NetInfo.fetch();
    const backendUrl = await AsyncStorage.getItem(BACKEND_URL_KEY);
    const token = await AsyncStorage.getItem("authToken");
    const body = {
      ...userInfo,
      ...userDraft,
    };
    if (!body.email) {
      setLoadingUserUpdate(false);
      Alert.alert("Error", "Email is required in user data.");
      return;
    }
    if (!net.isConnected || !backendUrl || !token) {
      // Save pending for later sync
      await AsyncStorage.setItem(USER_UPDATE_PENDING_KEY, JSON.stringify(body));
      await AsyncStorage.setItem(USER_INFO_KEY, JSON.stringify(body));
      setUserInfo(body);
      setEditUser(false);
      setLoadingUserUpdate(false);
      Alert.alert(
        "Saved offline",
        "User data will be updated when internet connection is available."
      );
      return;
    }
    try {
      const res = await fetch(`${backendUrl}/users/info/update-profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await AsyncStorage.setItem(USER_INFO_KEY, JSON.stringify(body));
        setUserInfo(body);
        setEditUser(false);
        Alert.alert("Saved", "User data updated successfully.");
        // Remove any pending update
        await AsyncStorage.removeItem(USER_UPDATE_PENDING_KEY);
      } else {
        throw new Error("Server error");
      }
    } catch (e) {
      // Save pending for later sync
      await AsyncStorage.setItem(USER_UPDATE_PENDING_KEY, JSON.stringify(body));
      await AsyncStorage.setItem(USER_INFO_KEY, JSON.stringify(body));
      setUserInfo(body);
      setEditUser(false);
      Alert.alert(
        "Saved offline",
        "User data will be updated when internet connection is available."
      );
    } finally {
      setLoadingUserUpdate(false);
    }
  };

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

  // NUEVO: Solo permitir PDF si es admin o creator
  const canDownloadPdf =
    isOnline &&
    userInfo &&
    (userInfo.user_type === "admin" ||
      userInfo.user_type === "creator" ||
      userInfo.user_type === "creador");

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#F4F3FF" }}>
      <View style={styles.container}>
        <Text style={styles.screenTitle}>Settings</Text>
        {/* Backend Section */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>Backend Connection 🔗</Text>
          <Text style={styles.label}>Backend URL:</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[
                styles.input,
                checkResult === "ok" && { borderColor: "#22c55e" },
                checkResult === "fail" && { borderColor: "#ef4444" },
              ]}
              value={input}
              onChangeText={(text) => {
                setInput(text);
                setCheckResult(null);
                setCheckMsg("");
              }}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="https://your-api-safemetrics.com"
              placeholderTextColor="#4B5563"
            />
            <TouchableOpacity
              style={styles.checkButton}
              onPress={handleCheck}
              disabled={checking}
            >
              {checking ? (
                <ActivityIndicator size={22} color="#2563eb" />
              ) : checkResult === "ok" ? (
                <MaterialIcons name="check-circle" size={26} color="#22c55e" />
              ) : checkResult === "fail" ? (
                <MaterialIcons name="cancel" size={26} color="#ef4444" />
              ) : (
                <MaterialIcons name="search" size={26} color="#2563eb" />
              )}
            </TouchableOpacity>
          </View>
          {checkMsg ? (
            <Text
              style={{
                color: checkResult === "ok" ? "#22c55e" : "#ef4444",
                marginBottom: 8,
                marginTop: 2,
                fontWeight: "bold",
              }}
            >
              {checkMsg}
            </Text>
          ) : null}
          <TouchableOpacity style={styles.button} onPress={handleSave}>
            <Text style={styles.buttonText}>Save URL</Text>
          </TouchableOpacity>
          <Text style={styles.current}>Current: {backendUrl}</Text>
        </View>

        {/* User Section */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>User Data 👤📊</Text>
          {userInfo && !editUser ? (
            <View style={styles.userBox}>
              <View style={styles.userRow}>
                <Text style={styles.userLabel}>Name:</Text>
                <Text style={styles.userValue}>{userInfo.name || ""}</Text>
              </View>
              <View style={styles.userRow}>
                <Text style={styles.userLabel}>Document:</Text>
                <Text style={styles.userValue}>
                  {userInfo.num_document || ""}
                </Text>
              </View>
              <View style={styles.userRow}>
                <Text style={styles.userLabel}>Phone:</Text>
                <Text style={styles.userValue}>{userInfo.telephone || ""}</Text>
              </View>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => setEditUser(true)}
              >
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
            </View>
          ) : userInfo && editUser ? (
            <View style={styles.userBox}>
              <Text style={styles.userLabel}>Name:</Text>
              <TextInput
                style={styles.userInput}
                value={userDraft.name || ""}
                onChangeText={(v) => setUserDraft((u) => ({ ...u, name: v }))}
                placeholder="Name"
                placeholderTextColor="#4B5563"
              />
              <Text style={styles.userLabel}>Document:</Text>
              <TextInput
                style={styles.userInput}
                value={userDraft.num_document || ""}
                onChangeText={(v) =>
                  setUserDraft((u) => ({ ...u, num_document: v }))
                }
                placeholder="Document"
                placeholderTextColor="#4B5563"
              />
              <Text style={styles.userLabel}>Phone:</Text>
              <TextInput
                style={styles.userInput}
                value={userDraft.telephone || ""}
                onChangeText={(v) =>
                  setUserDraft((u) => ({ ...u, telephone: v }))
                }
                keyboardType="phone-pad"
                placeholder="Phone"
                placeholderTextColor="#4B5563"
              />
              <View style={{ flexDirection: "row", marginTop: 10 }}>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSaveUser}
                  disabled={loadingUserUpdate}
                >
                  {loadingUserUpdate ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    { backgroundColor: "#ccc", marginLeft: 10 },
                  ]}
                  onPress={() => {
                    setUserDraft(userInfo);
                    setEditUser(false);
                  }}
                  disabled={loadingUserUpdate}
                >
                  <Text style={[styles.saveButtonText, { color: "#333" }]}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <Text style={styles.userLabel}>No user data available.</Text>
          )}
        </View>

        {/* NUEVA SECCIÓN: Formatos PDF */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>Formatos PDF 📄⬇️</Text>
          <Text style={styles.label}>
            Descarga y personaliza los formatos en PDF.
          </Text>
          <TouchableOpacity
            style={[
              styles.pdfButton,
              !canDownloadPdf && styles.pdfButtonDisabled,
            ]}
            onPress={() => {
              if (canDownloadPdf) {
                router.push("/form-pdf-manager");
              }
            }}
            disabled={!canDownloadPdf}
            activeOpacity={canDownloadPdf ? 0.8 : 1}
          >
            <Text
              style={[
                styles.pdfButtonText,
                !canDownloadPdf && { color: "#aaa" },
              ]}
            >
              {canDownloadPdf
                ? "Ver y descargar formatos"
                : !isOnline
                  ? "Conéctate a internet para descargar PDF"
                  : "Solo disponible para administradores o creadores"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ✅ NUEVA SECCIÓN: Logs de Errores */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>Logs de Errores 📋🔍</Text>
          <Text style={styles.label}>
            Ver, exportar y administrar logs de errores de la aplicación.
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => setShowLogViewer(true)}
          >
            <Text style={styles.buttonText}>Ver Logs de Errores</Text>
          </TouchableOpacity>
        </View>

        {/* 🔥 NUEVA SECCIÓN: Firebase Crashlytics Testing */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>Firebase Crashlytics 🔥</Text>
          <Text style={styles.label}>
            Prueba el sistema de detección de errores de Firebase.
          </Text>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: "#f59e0b" }]}
            onPress={() => {
              Alert.alert(
                "⚠️ Prueba de Error NO Fatal",
                "Esto registrará un error en Crashlytics sin cerrar la app",
                [
                  { text: "Cancelar", style: "cancel" },
                  {
                    text: "Registrar Error",
                    onPress: () => {
                      try {
                        crashlyticsService.recordError(
                          new Error("Test error NO fatal desde Settings"),
                          "Settings - Test Button"
                        );
                        Alert.alert("✅", "Error registrado en Crashlytics");
                      } catch (e) {
                        Alert.alert("❌", "Error: " + e.message);
                      }
                    },
                  },
                ]
              );
            }}
          >
            <Text style={styles.buttonText}>Test Error NO Fatal</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: "#ef4444", marginTop: 10 },
            ]}
            onPress={() => {
              Alert.alert(
                "💥 Forzar Crash Fatal",
                "⚠️ ESTO CERRARÁ LA APP INMEDIATAMENTE\n\nÚsalo para verificar que Crashlytics detecta crashes reales.",
                [
                  { text: "Cancelar", style: "cancel" },
                  {
                    text: "Forzar Crash",
                    style: "destructive",
                    onPress: () => {
                      setTimeout(() => {
                        crashlyticsService.forceCrash();
                      }, 500);
                    },
                  },
                ]
              );
            }}
          >
            <Text style={styles.buttonText}>⚠️ Forzar Crash Fatal</Text>
          </TouchableOpacity>

          <Text
            style={[
              styles.label,
              { marginTop: 10, fontSize: 12, color: "#6b7280" },
            ]}
          >
            Los errores pueden tardar 3-5 minutos en aparecer en Firebase
            Console.
          </Text>
        </View>

        {/* 🔥 NUEVA SECCIÓN: Gestión de Caché */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>Gestión de Caché 💾🧹</Text>
          <Text style={styles.label}>
            Administra el almacenamiento en caché para optimizar el rendimiento.
          </Text>

          {cacheStats && (
            <View style={styles.cacheStatsBox}>
              <View style={styles.cacheStatRow}>
                <Text style={styles.cacheStatLabel}>Tamaño total:</Text>
                <Text style={styles.cacheStatValue}>
                  {cacheStats.totalSizeFormatted}
                </Text>
              </View>
              <View style={styles.cacheStatRow}>
                <Text style={styles.cacheStatLabel}>Uso:</Text>
                <Text
                  style={[
                    styles.cacheStatValue,
                    cacheStats.usagePercentage > 80 && { color: "#ef4444" },
                  ]}
                >
                  {cacheStats.usagePercentage}%
                </Text>
              </View>
              <View style={styles.cacheStatRow}>
                <Text style={styles.cacheStatLabel}>Claves gestionadas:</Text>
                <Text style={styles.cacheStatValue}>
                  {cacheStats.managedKeys}
                </Text>
              </View>
              {cacheStats.expiredCount > 0 && (
                <View style={styles.cacheStatRow}>
                  <Text style={styles.cacheStatLabel}>Entradas expiradas:</Text>
                  <Text style={[styles.cacheStatValue, { color: "#f59e0b" }]}>
                    {cacheStats.expiredCount}
                  </Text>
                </View>
              )}
            </View>
          )}

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <TouchableOpacity
              style={[styles.button, { flex: 1 }]}
              onPress={async () => {
                setLoadingCache(true);
                const stats = await getCacheStats();
                setCacheStats(stats);
                setLoadingCache(false);
              }}
              disabled={loadingCache}
            >
              {loadingCache ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Ver Estadísticas</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, { flex: 1, backgroundColor: "#f59e0b" }]}
              onPress={async () => {
                Alert.alert(
                  "Limpiar Caché Expirado",
                  "¿Eliminar entradas expiradas del caché?",
                  [
                    { text: "Cancelar", style: "cancel" },
                    {
                      text: "Limpiar",
                      onPress: async () => {
                        setLoadingCache(true);
                        const removed = await cleanExpiredCache();
                        const stats = await getCacheStats();
                        setCacheStats(stats);
                        setLoadingCache(false);
                        Alert.alert("Éxito", `${removed} entradas eliminadas`);
                      },
                    },
                  ]
                );
              }}
              disabled={loadingCache}
            >
              <Text style={styles.buttonText}>Limpiar Expirado</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: "#ef4444", marginTop: 10 },
            ]}
            onPress={async () => {
              Alert.alert(
                "Limpiar Todo el Caché",
                "¿Estás seguro? Esto eliminará todos los datos en caché (excepto token y configuración).",
                [
                  { text: "Cancelar", style: "cancel" },
                  {
                    text: "Limpiar Todo",
                    style: "destructive",
                    onPress: async () => {
                      setLoadingCache(true);
                      const removed = await clearManagedCache();
                      const stats = await getCacheStats();
                      setCacheStats(stats);
                      setLoadingCache(false);
                      Alert.alert(
                        "Éxito",
                        `${removed} claves eliminadas. Reinicia la app para aplicar cambios.`
                      );
                    },
                  },
                ]
              );
            }}
            disabled={loadingCache}
          >
            <Text style={styles.buttonText}>Limpiar Todo</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ✅ Modal para el visor de logs */}
      <Modal
        visible={showLogViewer}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowLogViewer(false)}
      >
        <LogViewer onClose={() => setShowLogViewer(false)} />
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 18,
    backgroundColor: "#F4F3FF",
  },
  screenTitle: {
    fontWeight: "bold",
    fontSize: 26,
    color: "#4B34C7",
    marginBottom: 18,
    letterSpacing: 0.5,
    alignSelf: "center",
  },
  sectionBox: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    marginBottom: 24,
    shadowColor: "#4B34C7",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1.5,
    borderColor: "#E0DEFF",
  },
  sectionTitle: {
    fontWeight: "bold",
    fontSize: 18,
    color: "#4B34C7",
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  label: { fontSize: 15, marginBottom: 8, color: "#222" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#12A0AF",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    flex: 1,
    marginRight: 8,
    backgroundColor: "#F7F7FF",
    color: "#222",
  },
  checkButton: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 36,
    minHeight: 36,
  },
  button: {
    backgroundColor: "#4B34C7",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    marginBottom: 10,
    marginTop: 2,
  },
  buttonText: { color: "white", fontWeight: "bold", fontSize: 16 },
  current: { color: "#888", fontSize: 13, marginTop: 6 },
  userBox: {
    backgroundColor: "#F7F7FF",
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#12A0AF",
  },
  userRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  userLabel: {
    fontWeight: "bold",
    color: "#4B34C7",
    fontSize: 15,
    marginBottom: 2,
  },
  userValue: {
    color: "#222",
    fontWeight: "normal",
    fontSize: 15,
    marginLeft: 8,
  },
  userInput: {
    borderWidth: 1,
    borderColor: "#12A0AF",
    borderRadius: 8,
    padding: 8,
    fontSize: 15,
    marginBottom: 8,
    backgroundColor: "#fff",
    color: "#222",
  },
  editButton: {
    marginTop: 10,
    backgroundColor: "#12A0AF",
    borderRadius: 6,
    padding: 10,
    alignItems: "center",
    alignSelf: "flex-end",
    minWidth: 90,
  },
  editButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 15,
    textAlign: "center",
  },
  saveButton: {
    backgroundColor: "#22c55e",
    borderRadius: 6,
    padding: 10,
    alignItems: "center",
    flex: 1,
  },
  saveButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 15,
    textAlign: "center",
  },
  pdfButton: {
    backgroundColor: "#12A0AF",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 10,
    marginBottom: 2,
  },
  pdfButtonDisabled: {
    backgroundColor: "#e5e7eb",
  },
  pdfButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  cacheStatsBox: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cacheStatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  cacheStatLabel: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  cacheStatValue: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "700",
  },
});
