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
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import MatrixBackground from "./MatrixBackground";
import { Screen } from "./Screen";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons"; // Importar íconos

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
const DEFAULT_BACKEND_URL = "https://api-forms-sfi.service.saferut.com";

// Utilidad para obtener la URL base del backend
const getBackendUrl = async () => {
  const stored = await AsyncStorage.getItem(BACKEND_URL_KEY);
  return stored || DEFAULT_BACKEND_URL;
};

export function Main() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isOffline, setIsOffline] = useState(false);
  const [userData, setUserData] = useState(null); // Estado para guardar los datos del usuario
  const [showPassword, setShowPassword] = useState(false); // Estado para mostrar/ocultar contraseña
  const [errors, setErrors] = useState({}); // Estado para errores visuales
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL);
  const [showBackendModal, setShowBackendModal] = useState(false);
  const [backendInput, setBackendInput] = useState("");
  const [backendUrlSet, setBackendUrlSet] = useState(false);

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

  useEffect(() => {
    const checkToken = async () => {
      try {
        const savedToken = await AsyncStorage.getItem("authToken");
        const isLoggedOut = await AsyncStorage.getItem("isLoggedOut");

        console.log("🔑 Token recuperado:", savedToken);
        console.log("🚪 Estado de sesión:", isLoggedOut);

        // Solo permite acceso automático si isLoggedOut !== "true"
        if (savedToken && isLoggedOut !== "true") {
          const responseUser = await fetch(
            `https://api-forms-sfi.service.saferut.com/auth/validate-token`,
            {
              method: "GET",
              headers: { Authorization: `Bearer ${savedToken}` },
            }
          );

          if (!responseUser.ok) {
            const errorUserText = await responseUser.text();
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

    try {
      if (isOffline) {
        // --- OFFLINE LOGIN ---
        const tokensRaw = await AsyncStorage.getItem(TOKENS_KEY);
        const tokens = tokensRaw ? JSON.parse(tokensRaw) : {};
        console.log("🔍 [OFFLINE] Tokens in storage:", tokens);
        const userEntry = tokens[username.toLowerCase()];
        console.log(
          "🔍 [OFFLINE] Entry for user:",
          username.toLowerCase(),
          userEntry
        );
        if (userEntry && userEntry.password === password && userEntry.token) {
          Alert.alert("Offline Mode", "Logged in without connection.");
          await AsyncStorage.setItem("isLoggedOut", "false");
          await AsyncStorage.setItem("authToken", userEntry.token);
          console.log(
            "✅ [OFFLINE] Login success, token set:",
            userEntry.token
          );
          router.push("/home");
          return;
        } else {
          Alert.alert(
            "Error",
            "No saved token or credentials for this user. Please log in online at least once."
          );
          console.log("❌ [OFFLINE] No matching token for user/password.");
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

      const response = await fetch(`${backendUrlToUse}/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log("❌ [ONLINE] Error response from /auth/token:", errorText);
        throw new Error(errorText);
      }

      const text = await response.text();

      if (text.trim().startsWith("<!DOCTYPE html>")) {
        console.log("❌ [ONLINE] HTML response from /auth/token:", text);
        throw new Error("Server connection error. Please try again later.");
      }

      let json;
      try {
        json = JSON.parse(text);
      } catch (parseError) {
        console.log("❌ [ONLINE] JSON parse error:", text);
        throw new Error("Server response is not valid JSON.");
      }

      const token = json.access_token;
      console.log("✅ [ONLINE] Received token:", token);

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
      console.log(
        "💾 [ONLINE] Saved token for user:",
        username.toLowerCase(),
        tokens[username.toLowerCase()]
      );

      // Validar el token usando GET
      const responseUser = await fetch(
        `${backendUrlToUse}/auth/validate-token`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!responseUser.ok) {
        const errorUserText = await responseUser.text();
        console.log("❌ [ONLINE] Error validating token:", errorUserText);
        throw new Error(errorUserText);
      }

      const userData = await responseUser.json();
      setUserData(userData);
      await AsyncStorage.setItem("isLoggedOut", "false");
      console.log("✅ [ONLINE] User validated, navigating to home.");
      // Guarda también la info de usuario para offline
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
      console.log("💾 [ONLINE] Saved user info for offline:", userInfoKey);

      router.push({
        pathname: "/home",
        params: { name: userData.name, email: userData.email },
      });

      // Opcional: puedes guardar el usuario y contraseña para autocompletar
      await AsyncStorage.setItem("username", username);
      await AsyncStorage.setItem("password", password);
    } catch (error) {
      console.log("❌ [LOGIN ERROR]", error);
      Alert.alert(
        "Login Error",
        error.message?.includes("Method Not Allowed")
          ? "The /auth/token endpoint does not allow POST. Contact your system administrator."
          : "Check your username and password."
      );
    }
  };

  return (
    <Screen>
      <View style={styles.container}>
        <MatrixBackground />
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
          {/* Mostrar solo si la URL no ha sido seteada */}
          {!backendUrlSet && (
            <Modal
              visible={showBackendModal}
              transparent
              animationType="fade"
              onRequestClose={() => {}}
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
                    Configura la conexión backend
                  </Text>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: "#12A0AF",
                      borderRadius: 8,
                      padding: 10,
                      width: "100%",
                      marginBottom: 10,
                    }}
                    placeholder="https://api-forms-sfi.service.saferut.com"
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
                      }}
                    >
                      <Text
                        style={{
                          color: "white",
                          fontWeight: "bold",
                          fontSize: 16,
                        }}
                      >
                        Guardar
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
            disabled={!backendUrlSet}
          >
            <Text
              style={styles.buttonText}
              numberOfLines={1}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.8}
              ellipsizeMode="clip"
            >
              {isOffline ? "Sign in Offline Mode" : "Sign In"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
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
