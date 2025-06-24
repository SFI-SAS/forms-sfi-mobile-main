import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BACKEND_URL_KEY = "backend_url";

export default function Settings() {
  const [backendUrl, setBackendUrl] = useState("");
  const [input, setInput] = useState("");

  useEffect(() => {
    AsyncStorage.getItem(BACKEND_URL_KEY).then((url) => {
      setBackendUrl(url || "");
      setInput(url || "");
    });
  }, []);

  const handleSave = async () => {
    let url = input.trim();
    if (!/^https?:\/\//.test(url)) {
      url = "https://" + url;
    }
    await AsyncStorage.setItem(BACKEND_URL_KEY, url);
    setBackendUrl(url);
    Alert.alert("Saved", "Backend URL updated.");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.label}>Backend URL:</Text>
      <TextInput
        style={styles.input}
        value={input}
        onChangeText={setInput}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="https://your-api-safemetrics.com"
      />
      <TouchableOpacity style={styles.button} onPress={handleSave}>
        <Text style={styles.buttonText}>Save</Text>
      </TouchableOpacity>
      <Text style={styles.current}>Current: {backendUrl}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: "#fff" },
  title: {
    fontWeight: "bold",
    fontSize: 22,
    marginBottom: 18,
    color: "#4B34C7",
  },
  label: { fontSize: 16, marginBottom: 8, color: "#222" },
  input: {
    borderWidth: 1,
    borderColor: "#12A0AF",
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#2563eb",
    borderRadius: 6,
    padding: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  buttonText: { color: "white", fontWeight: "bold", fontSize: 16 },
  current: { color: "#888", fontSize: 13, marginTop: 10 },
});
