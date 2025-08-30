// Main.jsx
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
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import MatrixBackground from "./MatrixBackground";
import { Screen } from "./Screen";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons"; // Importar íconos
import { SvgXml } from "react-native-svg"; // Agrega esta importación

// Obtener dimensiones de la pantalla
const { width, height } = Dimensions.get("window");

// Función auxiliar para construir la cadena x-www-form-urlencoded
function encodeFormData(data) {
  return Object.keys(data)
    .map(
      (key) =>
        encodeURIComponent(key) + "=" + encodeURIComponent(data[key] ?? "")
    )
    .join("&");
}

const BACKEND_URL_KEY = "backend_url";
const getBackendUrl = async () => {
  const stored = await AsyncStorage.getItem(BACKEND_URL_KEY);
  return stored || "";
};

// Estado global para MatrixBackground (solo ejecuta una vez y nunca se reinicia)
let matrixEffectShown = false;
let matrixLoopStarted = false;

// Spinner SVG igual que en Home/FormatScreen
const spinnerSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path fill="#000000FF" stroke="#EE4138FF" stroke-width="15" transform-origin="center" d="m148 84.7 13.8-8-10-17.3-13.8 8a50 50 0 0 0-27.4-15.9v-16h-20v16A50 50 0 0 0 63 67.4l-13.8-8-10 17.3 13.8 8a50 50 0 0 0 0 31.7l-13.8 8 10 17.3 13.8-8a50 50 0 0 0 27.5 15.9v16h20v-16a50 50 0 0 0 27.4-15.9l13.8 8 10-17.3-13.8-8a50 50 0 0 0 0-31.7Zm-47.5 50.8a35 35 0 1 1 0-70 35 35 0 0 1 0 70Z"><animateTransform type="rotate" attributeName="transform" calcMode="spline" dur="1.8" values="0;120" keyTimes="0;1" keySplines="0 0 1 1" repeatCount="indefinite"></animateTransform></path></svg>
`;

export function Main() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isOffline, setIsOffline] = useState(false);
  const [userData, setUserData] = useState(null); // Estado para guardar los datos del usuario
  const [showPassword, setShowPassword] = useState(false); // Estado para mostrar/ocultar contraseña
  const [errors, setErrors] = useState({}); // Estado para errores visuales
  const [backendUrl, setBackendUrl] = useState("");
  const [showBackendModal, setShowBackendModal] = useState(false);
  const [backendInput, setBackendInput] = useState("");
  const [backendUrlSet, setBackendUrlSet] = useState(false);
  const [showBackendError, setShowBackendError] = useState(false);
  const [backendErrorMsg, setBackendErrorMsg] = useState("");
  const [showMatrix, setShowMatrix] = useState(!matrixEffectShown);
  const [signingIn, setSigningIn] = useState(false); // Nuevo estado para spinner

  // Solo pregunta la primera vez
  useEffect(() => {
    AsyncStorage.getItem(BACKEND_URL_KEY).then((url) => {
      if (url) {
        setBackendUrl(url);
        setBackendUrlSet(true);
      } else {
        setShowBackendModal(true); // Mostrar modal la primera vez
      }
    });
  }, []);

  // Validación de email simple
  const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  // Corrige el patrón de BackHandler para evitar el warning de removeEventListener
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

  // Logout automático al cerrar la app
  useEffect(() => {
    const handleAppStateChange = async (nextAppState) => {
      if (nextAppState === "background" || nextAppState === "inactive") {
        await AsyncStorage.removeItem("authToken");
        await AsyncStorage.setItem("isLoggedOut", "true");
      }
    };
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );
    return () => {
      subscription.remove();
    };
  }, []);

  // MatrixBackground solo una vez y loop independiente, nunca se reinicia
  useEffect(() => {
    if (!matrixLoopStarted && showMatrix) {
      matrixEffectShown = true;
      matrixLoopStarted = true;
      // No ocultes el efecto, deja que MatrixBackground maneje su propio loop
      // Si quieres ocultar visualmente después de un tiempo, puedes usar setShowMatrix(false)
      // pero el efecto nunca se reinicia por cambios de estado
    }
  }, [showMatrix]);

  useEffect(() => {
    const checkToken = async () => {
      try {
        const savedToken = await AsyncStorage.getItem("authToken");
        const isLoggedOut = await AsyncStorage.getItem("isLoggedOut");

        console.log("🔑 Token recuperado:", savedToken);
        console.log("🚪 Estado de sesión:", isLoggedOut);

        // Solo permite acceso automático si isLoggedOut !== "true"
        if (savedToken && isLoggedOut !== "true") {
          const backendUrlToUse = await getBackendUrl();
          let responseUser;
          let isOnline = false;
          try {
            // Verifica si hay conexión antes de intentar validar el token
            isOnline = await NetInfo.fetch().then((state) => state.isConnected);
            if (!isOnline) {
              // Si está offline, no preguntar la URL, solo salir
              return;
            }
            responseUser = await fetch(
              `${backendUrlToUse}/auth/validate-token`,
              {
                method: "GET",
                headers: { Authorization: `Bearer ${savedToken}` },
              }
            );
          } catch (err) {
            // Solo preguntar la URL si hay conexión pero el backend está caído
            if (isOnline) {
              setBackendUrlSet(false);
              setShowBackendModal(true);
              setBackendErrorMsg(
                "No se pudo conectar al backend. Por favor revisa la URL o tu conexión."
              );
              setShowBackendError(true);
            }
            return;
          }

          if (!responseUser.ok) {
            const errorUserText = await responseUser.text();
            // Solo preguntar la URL si hay conexión pero el backend está caído
            if (
              (await NetInfo.fetch()).isConnected &&
              (errorUserText.includes("Failed to fetch") ||
                errorUserText.includes("Network request failed") ||
                errorUserText.includes("ENOTFOUND") ||
                errorUserText.includes("timeout") ||
                errorUserText.includes("NetworkError") ||
                errorUserText.includes("offline"))
            ) {
              setBackendUrlSet(false);
              setShowBackendModal(true);
              setBackendErrorMsg(
                "No se pudo conectar al backend. Por favor revisa la URL o tu conexión."
              );
              setShowBackendError(true);
              return;
            }
            throw new Error(errorUserText);
          }

          const userData = await responseUser.json();
          setUserData(userData); // Guardar los datos del usuario
          router.push({
            pathname: "/home",
            params: { name: userData.name, email: userData.email }, // Pasar datos como props
          });
        } else {
          // Si está deslogueado, limpia token por seguridad
          await AsyncStorage.removeItem("authToken");
          await AsyncStorage.setItem("isLoggedOut", "true");
        }
      } catch (error) {
        // Solo preguntar la URL si hay conexión pero el backend está caído
        NetInfo.fetch().then((state) => {
          if (
            state.isConnected &&
            ((error.message &&
              (error.message.includes("Failed to fetch") ||
                error.message.includes("Network request failed") ||
                error.message.includes("ENOTFOUND") ||
                error.message.includes("timeout") ||
                error.message.includes("NetworkError") ||
                error.message.includes("offline"))) ||
              (typeof error === "string" && error.includes("offline")))
          ) {
            setBackendUrlSet(false);
            setShowBackendModal(true);
            setBackendErrorMsg(
              "No se pudo conectar al backend. Por favor revisa la URL o tu conexión."
            );
            setShowBackendError(true);
          }
        });
        console.error("❌ Error obteniendo el token:", error);
      }
    };

    const handleNetworkChange = async (state) => {
      const wasOffline = isOffline;
      setIsOffline(!state.isConnected);
    };

    NetInfo.fetch().then((state) => setIsOffline(!state.isConnected));
    const unsubscribe = NetInfo.addEventListener(handleNetworkChange);

    checkToken();
    return () => unsubscribe();
  }, [router, isOffline]);

  // Cambia el manejo de tokens para soportar múltiples usuarios
  // Clave para guardar tokens por usuario
  const TOKENS_KEY = "user_tokens"; // { [email]: { password, token } }

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

    setSigningIn(true); // Mostrar spinner al iniciar login
    try {
      if (isOffline) {
        // --- OFFLINE LOGIN ---
        const tokensRaw = await AsyncStorage.getItem(TOKENS_KEY);
        const tokens = tokensRaw ? JSON.parse(tokensRaw) : {};
        const userEntry = tokens[username.toLowerCase()];
        if (userEntry && userEntry.password === password && userEntry.token) {
          Alert.alert("Offline Mode", "Logged in without connection.");
          await AsyncStorage.setItem("isLoggedOut", "false");
          await AsyncStorage.setItem("authToken", userEntry.token);
          router.push("/home");
          return;
        } else {
          setErrors({
            password:
              "No saved token or credentials for this user. Please log in online at least once.",
          });
          return;
        }
      }

      const backendUrlToUse = await getBackendUrl();

      // Construir la cadena de parámetros manualmente
      const params = encodeFormData({
        grant_type: "password",
        username: username,
        password: password,
        scope: "",
        client_id: "",
        client_secret: "",
      });

      let response;
      try {
        response = await fetch(`${backendUrlToUse}/auth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params,
        });
      } catch (fetchError) {
        // Error de red/fetch
        setBackendErrorMsg(
          "Could not connect to the backend. Please check the URL or your connection."
        );
        setShowBackendError(true);
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        // Detectar error de red (sin conexión real)
        if (
          errorText.includes("Failed to fetch") ||
          errorText.includes("Network request failed") ||
          errorText.includes("ENOTFOUND") ||
          errorText.includes("timeout") ||
          errorText.includes("NetworkError")
        ) {
          setBackendErrorMsg(
            "Could not connect to the backend. Please check the URL or your connection."
          );
          setShowBackendError(true);
          return;
        }
        // Si es error de usuario/contraseña, mostrar solo ese error
        setErrors({
          password: "Incorrect username or password. Please try again.",
        });
        return;
      }

      const text = await response.text();

      if (text.trim().startsWith("<!DOCTYPE html>")) {
        setErrors({
          password: "Server connection error. Please try again later.",
        });
        return;
      }

      let json;
      try {
        json = JSON.parse(text);
      } catch (parseError) {
        setErrors({
          password: "Server response is not valid JSON.",
        });
        return;
      }

      const token = json.access_token;

      // Guarda el token en la sesión actual
      await AsyncStorage.setItem("authToken", token);
      await AsyncStorage.setItem("isLoggedOut", "false");

      // Guarda el token en el mapa de usuarios para login offline
      const tokensRaw = await AsyncStorage.getItem(TOKENS_KEY);
      const tokens = tokensRaw ? JSON.parse(tokensRaw) : {};
      tokens[username.toLowerCase()] = {
        password,
        token,
      };
      await AsyncStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));

      // Validar el token usando GET
      let responseUser;
      try {
        responseUser = await fetch(`${backendUrlToUse}/auth/validate-token`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (fetchError) {
        setBackendErrorMsg(
          "Could not connect to the backend. Please check the URL or your connection."
        );
        setShowBackendError(true);
        return;
      }

      if (!responseUser.ok) {
        setErrors({
          password: "Could not validate user session. Please try again.",
        });
        return;
      }

      const userData = await responseUser.json();
      setUserData(userData);
      await AsyncStorage.setItem("isLoggedOut", "false");
      const userInfoKey = `user_info_${username.toLowerCase()}`;
      await AsyncStorage.setItem(
        userInfoKey,
        JSON.stringify({
          ...userData,
          username,
          password,
          token,
        })
      );

      router.push({
        pathname: "/home",
        params: { name: userData.name, email: userData.email },
      });

      await AsyncStorage.setItem("username", username);
      await AsyncStorage.setItem("password", password);
    } catch (error) {
      setSigningIn(false);
      setErrors({
        password: "Unexpected error. Please try again.",
      });
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {/* MatrixBackground solo la primera vez, nunca se reinicia */}
        {showMatrix && <MatrixBackground />}
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
          {/* Mostrar solo si la URL no ha sido seteada o si hay error de backend */}
          {(!backendUrlSet || showBackendError) && (
            <Modal
              visible={showBackendModal || showBackendError}
              transparent
              animationType="fade"
              onRequestClose={() => {
                setShowBackendModal(false);
                setShowBackendError(false);
              }}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0,0,0,0.4)",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    backgroundColor: "#fff",
                    borderRadius: 10,
                    padding: 24,
                    width: "85%",
                    alignItems: "center",
                    elevation: 5,
                  }}
                >
                  <Text
                    style={{
                      fontWeight: "bold",
                      fontSize: 18,
                      marginBottom: 8,
                      color: "#222",
                      textAlign: "center",
                    }}
                  >
                    Configure backend connection
                  </Text>
                  {showBackendError && (
                    <Text
                      style={{
                        color: "#ef4444",
                        marginBottom: 8,
                        textAlign: "center",
                        fontWeight: "bold",
                      }}
                    >
                      {backendErrorMsg}
                    </Text>
                  )}
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: "#12A0AF",
                      borderRadius: 8,
                      padding: 10,
                      width: "100%",
                      marginBottom: 10,
                    }}
                    placeholder="https://your-api-from-safemetrics.com"
                    value={backendInput}
                    onChangeText={setBackendInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <View
                    style={{
                      flexDirection: "row",
                      width: "100%",
                      justifyContent: "space-between",
                    }}
                  >
                    <TouchableOpacity
                      style={{
                        backgroundColor: "#2563eb",
                        borderRadius: 6,
                        padding: 12,
                        alignItems: "center",
                        flex: 1,
                        marginRight: 8,
                      }}
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
                      <Text
                        style={{
                          color: "white",
                          fontWeight: "bold",
                          fontSize: 16,
                        }}
                      >
                        Save
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          )}
          <TouchableOpacity
            onPress={handleLogin}
            style={styles.button}
            disabled={!backendUrlSet || signingIn}
          >
            {signingIn ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <SvgXml
                  xml={spinnerSvg.replace("#000000FF", "#fff")}
                  width={28}
                  height={28}
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
  formContainer: {
    width: width * 0.9, // 90% del ancho de la pantalla
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
    fontSize: width * 0.08, // Tamaño de fuente dinámico (8% del ancho de la pantalla)
    fontWeight: "bold",
    color: "#4B34C7",
    textAlign: "center",
    marginBottom: 20,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: width * 0.04, // Tamaño de fuente dinámico (4% del ancho de la pantalla)
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
    fontSize: width * 0.04, // Tamaño de fuente dinámico
  },
  errorText: {
    color: "#dc2626",
    fontSize: width * 0.035,
    marginTop: 2,
    marginLeft: 2,
  },
  button: {
    backgroundColor: "#12A0AF",
    paddingVertical: height * 0.02, // Altura dinámica (2% de la altura de la pantalla)
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: width * 0.045, // Tamaño de fuente dinámico (4.5% del ancho de la pantalla)
    fontWeight: "bold",
  },
});
