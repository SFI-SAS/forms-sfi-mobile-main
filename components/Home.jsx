// Home.jsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useRouter, useLocalSearchParams } from "expo-router";

export default function Home() {
  const router = useRouter();
  const { name, email } = useLocalSearchParams(); // Obtener datos del usuario desde las props
  const [showForms, setShowForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  const fetchForms = async () => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");

      const response = await fetch(
        "https://583d-179-33-13-68.ngrok-free.app/forms/users/form_by_user",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Error fetching forms");

      await AsyncStorage.setItem("offline_forms", JSON.stringify(data));
      setShowForms(data);
    } catch (error) {
      console.error("Error fetching forms:", error.message);
      Alert.alert("Error", "No se pudieron cargar los formularios online.");
    } finally {
      setLoading(false);
    }
  };

  const loadFormsOffline = async () => {
    try {
      const storedForms = await AsyncStorage.getItem("offline_forms");
      if (storedForms) {
        setShowForms(JSON.parse(storedForms));
      } else {
        console.log("No offline forms available");
        Alert.alert("Modo Offline", "No hay formularios guardados.");
      }
    } catch (error) {
      console.error("Error loading offline forms:", error);
      Alert.alert("Error", "No se pudieron cargar los formularios offline.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const wasOffline = isOffline;
      setIsOffline(!state.isConnected);

      if (state.isConnected && wasOffline) {
        console.log("📡 Conexión restaurada: Cargando formularios online...");
        fetchForms();
      } else if (!state.isConnected && !wasOffline) {
        console.log("📴 Conexión perdida: Cargando formularios offline...");
        loadFormsOffline();
      }
    });

    // Cargar formularios iniciales según el estado de conexión
    NetInfo.fetch().then((state) => {
      setIsOffline(!state.isConnected);
      if (state.isConnected) {
        fetchForms();
      } else {
        loadFormsOffline();
      }
    });

    return () => unsubscribe(); // Limpiar el listener al desmontar el componente
  }, []);

  const handleFormPress = (item) => {
    router.push({
      pathname: "/format-screen",
      params: { id: item.id, created_at: item.created_at },
    });
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.setItem("isLoggedOut", "true");
      router.push("/");
    } catch (error) {
      console.error("Error logging out:", error);
      Alert.alert("Error", "Failed to log out. Please try again.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Available Forms</Text>
      {/* <Text style={styles.userInfo}>
        Usuario: {name} | Email: {email}
      </Text> */}
      <Text style={isOffline ? styles.offlineText : styles.onlineText}>
        Status: {isOffline ? "Offline ◉" : "Online ◉"}
      </Text>
      {loading ? (
        <Text>Loading...</Text>
      ) : showForms.length > 0 ? (
        <FlatList
          data={showForms}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.formItem}
              onPress={() => handleFormPress(item)}
            >
              <Text style={styles.formText}>
                ID: 00{item.id} | Created: {item.created_at}
              </Text>
              <Text style={styles.formAction}>Llenar Formato</Text>
            </TouchableOpacity>
          )}
        />
      ) : (
        <Text>No hay formularios disponibles.</Text>
      )}
      <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#ffffff" },
  header: { fontSize: 20, fontWeight: "bold", marginBottom: 10 },
  userInfo: { fontSize: 16, color: "#555", marginBottom: 10 },
  onlineText: { color: "green", fontWeight: "bold", marginBottom: 10 },
  offlineText: { color: "red", fontWeight: "bold", marginBottom: 10 },
  formItem: {
    padding: 15,
    marginBottom: 10,
    backgroundColor: "#f0f0f0",
    borderRadius: 10,
  },
  formText: { fontSize: 16, color: "#333" },
  formAction: { color: "blue", marginTop: 5 },
  logoutButton: {
    marginTop: 20,
    padding: 10,
    backgroundColor: "red",
    borderRadius: 5,
    alignItems: "center",
  },
  logoutText: {
    color: "white",
    fontWeight: "bold",
  },
});
