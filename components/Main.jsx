// Main.jsx
import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import MatrixBackground from "./MatrixBackground";
import { Screen } from "./Screen";
import { useRouter } from "expo-router";

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

  useEffect(() => {
    const checkToken = async () => {
      try {
        const savedToken = await AsyncStorage.getItem("authToken");
        const isLoggedOut = await AsyncStorage.getItem("isLoggedOut");

        console.log("🔑 Token recuperado:", savedToken);
        console.log("🚪 Estado de sesión:", isLoggedOut);

        if (savedToken && isLoggedOut !== "true") {
          router.push("/home"); // Navigate to Home
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

      if (state.isConnected && wasOffline) {
        Alert.alert("Internet Restored", "Synchronizing data...");
        console.log("🔄 Synchronizing data...");
        // Add synchronization logic here if needed
      }
    };

    NetInfo.fetch().then((state) => setIsOffline(!state.isConnected));
    const unsubscribe = NetInfo.addEventListener(handleNetworkChange);

    checkToken();
    return () => unsubscribe();
  }, [router, isOffline]);

  const handleLogin = async () => {
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
        username: username,
        password: password,
        grant_type: "password",
      });

      // Primera petición: obtener token
      const response = await fetch(
        `https://d1b1-179-33-13-68.ngrok-free.app/auth/token`,
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
        `https://d1b1-179-33-13-68.ngrok-free.app/auth/validate-token`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!responseUser.ok) {
        const errorUserText = await responseUser.text();
        throw new Error(errorUserText);
      }

      await AsyncStorage.setItem("isLoggedOut", "false"); // Mark the session as logged in
      console.log("✅ Token guardado correctamente.");
      console.log("✅ Navigating to Home");
      router.push("/home"); // Navigate to Home
    } catch (error) {
      console.error("❌ API error:", error);
      Alert.alert("Error", error.message);
    }
  };

  return (
    <Screen>
      <View style={styles.container}>
        <MatrixBackground />
        <View style={{ padding: 20 }}>
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              onChangeText={setUsername}
              value={username}
              placeholder="name@company.com"
              keyboardType="email-address"
              style={styles.input}
            />
          </View>
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.label}>Contraseña</Text>
            <TextInput
              onChangeText={setPassword}
              value={password}
              placeholder="••••••••"
              secureTextEntry={true}
              style={styles.input}
            />
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
    paddingHorizontal: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1f2937",
  },
  input: {
    backgroundColor: "#f3f4f6",
    borderColor: "#d1d5db",
    color: "#1f2937",
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  button: {
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 16,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
