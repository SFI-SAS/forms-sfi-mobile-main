import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Dimensions,
  BackHandler,
  Modal,
  AppState,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import MatrixBackground from "./MatrixBackground";
import { Screen } from "./Screen";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { SvgXml } from "react-native-svg";
import { getMultipleItems } from "../utils/asyncStorageHelper";
import { initCacheManager } from "../utils/cacheManager";
import {
  login,
  validateToken,
  logout,
  isLoggedOut as checkIsLoggedOut,
} from "../services/auth";

const { width, height } = Dimensions.get("window");

function encodeFormData(data) {
  return Object.keys(data)
    .map(
      (key) =>
        encodeURIComponent(key) + "=" + encodeURIComponent(data[key] ?? "")
    )
    .join("&");
}

const BACKEND_URL_KEY = "backend_url";
const DEFAULT_BACKEND_URL = "https://api-forms-sfi.service.saferut.com";
const getBackendUrl = async () => {
  const stored = await AsyncStorage.getItem(BACKEND_URL_KEY);
  return stored || DEFAULT_BACKEND_URL;
};

const spinnerSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path fill="#000000FF" stroke="#EE4138FF" stroke-width="15" transform-origin="center" d="m148 84.7 13.8-8-10-17.3-13.8 8a50 50 0 0 0-27.4-15.9v-16h-20v16A50 50 0 0 0 63 67.4l-13.8-8-10 17.3 13.8 8a50 50 0 0 0 0 31.7l-13.8 8 10 17.3 13.8-8a50 50 0 0 0 27.5 15.9v16h20v-16a50 50 0 0 0 27.4-15.9l13.8 8 10-17.3-13.8-8a50 50 0 0 0 0-31.7Zm-47.5 50.8a35 35 0 1 1 0-70 35 35 0 0 1 0 70Z"><animateTransform type="rotate" attributeName="transform" calcMode="spline" dur="1.8" values="0;120" keyTimes="0;1" keySplines="0 0 1 1" repeatCount="indefinite"></animateTransform></path></svg>
`;

export function Main() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isOffline, setIsOffline] = useState(false);
  const [userData, setUserData] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [backendUrl, setBackendUrl] = useState("");
  const [showBackendModal, setShowBackendModal] = useState(false);
  const [backendInput, setBackendInput] = useState("");
  const [backendUrlSet, setBackendUrlSet] = useState(false);
  const [showBackendError, setShowBackendError] = useState(false);
  const [backendErrorMsg, setBackendErrorMsg] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(BACKEND_URL_KEY).then((url) => {
      if (url) {
        setBackendUrl(url);
        setBackendInput(url);
        setBackendUrlSet(true);
      } else {
        setShowBackendModal(true);
      }
    });
  }, []);

  const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  useFocusEffect(
    useCallback(() => {
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

  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log("🚀 Inicializando aplicación...");

        // 1. Inicializar Cache Manager
        await initCacheManager();

        // 2. Verificar si el usuario cerró sesión manualmente
        const loggedOut = await checkIsLoggedOut();
        if (loggedOut) {
          console.log("🚪 Usuario cerró sesión previamente");
          return;
        }

        // 4. Validar token existente
        console.log("🔍 Validando token...");
        const validation = await validateToken();

        if (validation.valid) {
          console.log("✅ Token válido - navegando a Home");
          router.replace("/home");
        } else {
          console.log(`❌ Token inválido: ${validation.reason}`);
          // Token inválido o expirado - mostrar login
        }
      } catch (error) {
        console.error("❌ Error inicializando app:", error);
      }
    };

    const handleNetworkChange = async (state) => {
      const wasOffline = isOffline;
      setIsOffline(!state.isConnected);
    };

    NetInfo.fetch().then((state) => setIsOffline(!state.isConnected));
    const unsubscribe = NetInfo.addEventListener(handleNetworkChange);

    initializeApp();
    return () => unsubscribe();
  }, [router, isOffline]);

  const TOKENS_KEY = "user_tokens";

  const handleLogin = async () => {
    let newErrors = {};
    if (!username.trim()) {
      newErrors.username = "Email is required.";
    } else if (!isValidEmail(username)) {
      newErrors.username = "Please enter a valid email.";
    }
    if (!password.trim()) {
      newErrors.password = "Password is required.";
    }
    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    setSigningIn(true);
    try {
      console.log("🔐 Iniciando login...");

      // Usar el servicio de autenticación
      const result = await login(username, password);

      if (result.success) {
        console.log("✅ Login exitoso");

        // Guardar credenciales para modo offline
        const tokensRaw = await AsyncStorage.getItem(TOKENS_KEY);
        const tokens = tokensRaw ? JSON.parse(tokensRaw) : {};
        tokens[username.toLowerCase()] = {
          password,
          token: result.token,
        };
        await AsyncStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));

        // Navegar a Home
        router.push("/home");
      } else {
        console.error("❌ Login fallido:", result.error);

        // Verificar si es problema de backend
        if (
          result.error.includes("URL del backend") ||
          result.error.includes("conexión")
        ) {
          setBackendErrorMsg(result.error);
          setShowBackendError(true);
        } else {
          setErrors({
            password:
              result.error ||
              "Incorrect username or password. Please try again.",
          });
        }
      }
    } catch (error) {
      console.error("❌ Error en handleLogin:", error);
      setErrors({
        password: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {/* Matrix siempre visible */}
        <MatrixBackground />

        {/* Botón de configuración en la esquina superior derecha */}
        <TouchableOpacity
          style={styles.configButton}
          onPress={() => {
            setShowBackendModal(true);
            setShowBackendError(false);
          }}
          accessibilityLabel="Configurar servidor"
        >
          <Ionicons name="settings-outline" size={24} color="#12A0AF" />
        </TouchableOpacity>

        <View style={styles.formContainer}>
          <Text style={styles.title}>Bienvenido</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              onChangeText={(text) => {
                setUsername(text);
                setErrors((prev) => ({ ...prev, username: undefined }));
              }}
              value={username}
              placeholder="name@company.com"
              placeholderTextColor="#4B5563"
              keyboardType="email-address"
              style={[
                styles.input,
                errors.username && { borderColor: "#dc2626" },
              ]}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {errors.username && (
              <Text style={styles.errorText}>{errors.username}</Text>
            )}
          </View>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Contraseña</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <TextInput
                onChangeText={(text) => {
                  setPassword(text);
                  setErrors((prev) => ({ ...prev, password: undefined }));
                }}
                value={password}
                placeholder="••••••••"
                placeholderTextColor="#4B5563"
                secureTextEntry={!showPassword}
                style={[
                  styles.input,
                  { flex: 1 },
                  errors.password && { borderColor: "#dc2626" },
                ]}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((prev) => !prev)}
                style={{ marginLeft: 8 }}
                accessibilityLabel={
                  showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                }
              >
                <Ionicons
                  name={showPassword ? "eye" : "eye-off"}
                  size={24}
                  color="#888"
                />
              </TouchableOpacity>
            </View>
            {errors.password && (
              <Text style={styles.errorText}>{errors.password}</Text>
            )}
          </View>

          {/* Modal de configuración del servidor */}
          <Modal
            visible={showBackendModal || showBackendError}
            transparent
            animationType="fade"
            onRequestClose={() => {
              setShowBackendModal(false);
              setShowBackendError(false);
            }}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>
                  Configure backend connection
                </Text>
                {showBackendError && (
                  <Text style={styles.errorMessage}>{backendErrorMsg}</Text>
                )}
                <TextInput
                  style={styles.modalInput}
                  placeholder="https://your-api-from-safemetrics.com"
                  placeholderTextColor="#4B5563"
                  value={backendInput}
                  onChangeText={setBackendInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={async () => {
                      let url = backendInput.trim();
                      if (!/^https?:\/\//.test(url)) {
                        url = "https://" + url;
                      }
                      setBackendUrl(url);
                      await AsyncStorage.setItem(BACKEND_URL_KEY, url);
                      setBackendUrlSet(true);
                      setShowBackendModal(false);
                      setShowBackendError(false);
                    }}
                  >
                    <Text style={styles.saveButtonText}>Save</Text>
                  </TouchableOpacity>
                  {backendUrlSet && (
                    <TouchableOpacity
                      style={styles.closeButton}
                      onPress={() => {
                        setShowBackendModal(false);
                        setShowBackendError(false);
                      }}
                    >
                      <Text style={styles.closeButtonText}>Close</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          </Modal>

          <TouchableOpacity
            onPress={handleLogin}
            style={styles.button}
            disabled={!backendUrlSet || signingIn}
          >
            {signingIn ? (
              <View style={styles.signingInContainer}>
                <ActivityIndicator
                  size="small"
                  color="#fff"
                  style={{ marginRight: 10 }}
                />
                <Text style={styles.buttonText}>Accediendo...</Text>
              </View>
            ) : (
              <Text
                style={styles.buttonText}
                numberOfLines={1}
                adjustsFontSizeToFit={true}
                minimumFontScale={0.8}
                ellipsizeMode="clip"
              >
                {isOffline ? "Sign in Offline Mode" : "Sign In"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  configButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 30,
    right: 20,
    backgroundColor: "#fff",
    borderRadius: 25,
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 1000,
  },
  formContainer: {
    width: width * 0.9,
    padding: 20,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  title: {
    fontSize: width * 0.08,
    fontWeight: "bold",
    color: "#4B34C7",
    textAlign: "center",
    marginBottom: 20,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: width * 0.04,
    fontWeight: "bold",
    color: "#4B34C7",
    marginBottom: 4,
  },
  input: {
    backgroundColor: "#f3f4f6",
    borderColor: "#d1d5db",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: width * 0.04,
  },
  errorText: {
    color: "#dc2626",
    fontSize: width * 0.035,
    marginTop: 2,
    marginLeft: 2,
  },
  button: {
    backgroundColor: "#12A0AF",
    paddingVertical: height * 0.02,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: width * 0.045,
    fontWeight: "bold",
  },
  signingInContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 24,
    width: "85%",
    alignItems: "center",
    elevation: 5,
  },
  modalTitle: {
    fontWeight: "bold",
    fontSize: 18,
    marginBottom: 8,
    color: "#222",
    textAlign: "center",
  },
  errorMessage: {
    color: "#ef4444",
    marginBottom: 8,
    textAlign: "center",
    fontWeight: "bold",
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#12A0AF",
    borderRadius: 8,
    padding: 10,
    width: "100%",
    marginBottom: 10,
  },
  modalButtons: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-between",
  },
  saveButton: {
    backgroundColor: "#2563eb",
    borderRadius: 6,
    padding: 12,
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  saveButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
  closeButton: {
    backgroundColor: "#6b7280",
    borderRadius: 6,
    padding: 12,
    alignItems: "center",
    flex: 1,
  },
  closeButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
});
