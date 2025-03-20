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
import NetInfo from "@react-native-community/netinfo"; // 📶 Verificar conexión a internet
import MatrixBackground from "./MatrixBackground";
import { Screen } from "./Screen";
import { Home } from "./Home";

export function Main() {
  const [isLogged, setIsLogged] = useState(false);
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
          setIsLogged(true);
        } else {
          console.warn("⚠️ No hay token guardado o usuario cerró sesión.");
        }
      } catch (error) {
        console.error("❌ Error obteniendo el token:", error);
      }
    };

    // Detectar conexión a internet y actualizar el estado en tiempo real
    NetInfo.fetch().then((state) => setIsOffline(!state.isConnected));

    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
    });

    checkToken();

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      // Si no hay internet, permitir acceso con el token guardado
      if (isOffline) {
        const offlineToken = await AsyncStorage.getItem("authToken");
        if (offlineToken) {
          setIsLogged(true);
          Alert.alert("Modo Offline", "Iniciaste sesión sin conexión.");
          return;
        } else {
          Alert.alert(
            "Error",
            "No tienes un token guardado para acceder sin internet."
          );
          return;
        }
      }

      // Si hay internet, realizar login normal
      const formData = new FormData();
      formData.append("username", username);
      formData.append("password", password);
      formData.append("grant_type", "password");

      const response = await fetch(
        `https://1a67-179-33-13-68.ngrok-free.app/auth/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(formData).toString(),
        }
      );

      const text = await response.text();
      const json = JSON.parse(text);

      const token = json.access_token;
      await AsyncStorage.setItem("authToken", token);
      const formDataUser = new FormData();
      formDataUser.append("token", token);

      const responseUser = await fetch(
        `https://1a67-179-33-13-68.ngrok-free.app/auth/validate-token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(formDataUser).toString(),
        }
      );
      if (!response.ok && !responseUser.ok)
        throw new Error(json.detail || "Error en la autenticación");

      await AsyncStorage.removeItem("isLoggedOut"); // Asegurar que no está marcado como cerrado

      console.log("✅ Token guardado correctamente.");
      setIsLogged(true);
    } catch (error) {
      console.error("❌ API error:", error);
      Alert.alert("Error", error.message);
    }
  };

  return isLogged ? (
    <Home setIsLogged={setIsLogged} isOffline={isOffline} />
  ) : (
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
