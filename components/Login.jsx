import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
} from "react-native";
import MatrixBackground from "./MatrixBackground";

const PUBLIC_API = "http://127.0.0.1:8000";

export function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    try {
      const formData = new FormData();
      formData.append("username", username);
      formData.append("password", password);
      formData.append("grant_type", "password");

      const response = await fetch(`https://4c1c-179-33-13-68.ngrok-free.app/auth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(formData).toString(),
      });


      const text = await response.text();
      console.log("Response Status:", response.status);
      console.log("Response Text:", text);

      const json = JSON.parse(text);

      if (!response.ok) {
        throw new Error(json.detail || "Error en la autenticación");
      }

      Alert.alert("Login exitoso", "Token recibido: " + json.access_token);
      console.log("Token:", json.access_token);
    } catch (error) {
      Alert.alert("Error", error.message);
      console.error("API error:", error);
    }
  };

  return (
    <View style={styles.container}>
      <MatrixBackground />
      <View style={{ padding: 20 }}>
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: "bold", color: "#1f2937" }}>
            Email
          </Text>
          <TextInput
            onChangeText={setUsername}
            value={username}
            placeholder="name@company.com"
            keyboardType="email-address"
            style={styles.input}
          />
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: "bold", color: "#1f2937" }}>
            Contraseña
          </Text>
          <TextInput
            onChangeText={setPassword}
            value={password}
            placeholder="••••••••"
            secureTextEntry={true}
            style={styles.input}
          />
        </View>

        <TouchableOpacity onPress={handleLogin} style={styles.button}>
          <Text style={styles.buttonText}>Sign in</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    color: "black",
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
