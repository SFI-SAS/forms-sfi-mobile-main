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

export function Main() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isOffline, setIsOffline] = useState(false);
  const [userData, setUserData] = useState(null); // Estado para guardar los datos del usuario
  const [showPassword, setShowPassword] = useState(false); // Estado para mostrar/ocultar contraseña
  const [errors, setErrors] = useState({}); // Estado para errores visuales

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
          console.warn("⚠️ No hay token guardado o usuario cerró sesión.");
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

  const handleLogin = async () => {
    let newErrors = {};
    if (!username.trim()) {
      newErrors.username = "El email es requerido.";
    } else if (!isValidEmail(username)) {
      newErrors.username = "Por favor ingresa un email válido.";
    }
    if (!password.trim()) {
      newErrors.password = "La contraseña es requerida.";
    }
    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    try {
      if (isOffline) {
        const offlineToken = await AsyncStorage.getItem("authToken");
        const offlineForms = await AsyncStorage.getItem("offline_forms");
        if (offlineToken && offlineForms) {
          Alert.alert("Modo Offline", "Iniciaste sesión sin conexión.");
          await AsyncStorage.setItem("isLoggedOut", "false"); // Mark the session as logged in
          router.push("/home"); // Navigate to Home
          return;
        } else {
          Alert.alert(
            "Error",
            "No tienes un token guardado o datos guardados para acceder sin internet."
          );
          return;
        }
      }

      // Construir la cadena de parámetros manualmente
      const params = encodeFormData({
        grant_type: "password",
        username: username,
        password: password,
        scope: "",
        client_id: "",
        client_secret: "",
      });
      console.log(params);

      // El endpoint /auth/token espera POST con application/x-www-form-urlencoded y los campos grant_type, username, password, scope, client_id, client_secret
      const response = await fetch(
        `https://api-forms-sfi.service.saferut.com/auth/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const text = await response.text();

      if (text.trim().startsWith("<!DOCTYPE html>")) {
        console.error("Respuesta HTML recibida:", text);
        throw new Error(
          "Error de conexión con el servidor. Por favor, inténtalo más tarde."
        );
      }

      let json;
      try {
        json = JSON.parse(text);
      } catch (parseError) {
        console.error("Error parseando JSON, respuesta recibida:", text);
        throw new Error("La respuesta del servidor no es un JSON válido.");
      }

      const token = json.access_token;

      await AsyncStorage.setItem("authToken", token); // Save token for offline access

      // Validar el token usando GET
      const responseUser = await fetch(
        `https://api-forms-sfi.service.saferut.com/auth/validate-token`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!responseUser.ok) {
        const errorUserText = await responseUser.text();
        throw new Error(errorUserText);
      }

      const userData = await responseUser.json();
      setUserData(userData);
      await AsyncStorage.setItem("isLoggedOut", "false"); // Mark the session as logged in
      console.log("✅ Token guardado correctamente.");
      console.log("✅ Navigating to Home");
      router.push({
        pathname: "/home",
        params: { name: userData.name, email: userData.email },
      }); // Navigate to Home

      // Cache user credentials for offline login
      await AsyncStorage.setItem("username", username);
      await AsyncStorage.setItem("password", password);

      console.log(userData);
    } catch (error) {
      console.error("❌ API error:", error);
      Alert.alert(
        "Error al iniciar sesión",
        error.message?.includes("Method Not Allowed")
          ? "El endpoint /auth/token no permite POST. Consulta con el administrador del sistema."
          : "Verifique su usuario y contraseña."
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
          <TouchableOpacity onPress={handleLogin} style={styles.button}>
            <Text style={styles.buttonText}>
              {isOffline ? "Iniciar en Modo Offline" : "Iniciar Sesión"}
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
