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
import { useRouter } from "expo-router";

export default function Home() {
  const router = useRouter();
  const [showForms, setShowForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  // Fetch forms from the API and save them to AsyncStorage
  const fetchForms = async () => {
    try {
      const token = await AsyncStorage.getItem("authToken"); // Retrieve the token from AsyncStorage
      if (!token) throw new Error("No authentication token found");

      const response = await fetch(
        "https://d1b1-179-33-13-68.ngrok-free.app/forms/users/form_by_user",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`, // Include the token in the Authorization header
            "Content-Type": "application/json",
          },
        }
      );

      const text = await response.text(); // Get raw response text
      console.log("Raw Response:", text); // Log raw response for debugging

      let data;
      try {
        data = JSON.parse(text); // Attempt to parse JSON
      } catch (error) {
        throw new Error("Invalid JSON response");
      }

      if (!response.ok) throw new Error(data.detail || "Error fetching forms");
      await AsyncStorage.setItem("offline_forms", JSON.stringify(data));
      setShowForms(data);
    } catch (error) {
      console.error("Error fetching forms:", error.message);
      loadFormsOffline();
    } finally {
      setLoading(false);
    }
  };

  // Load forms from AsyncStorage for offline access
  const loadFormsOffline = async () => {
    try {
      const storedForms = await AsyncStorage.getItem("offline_forms");
      if (storedForms) {
        setShowForms(JSON.parse(storedForms));
      } else {
        console.log("No offline forms available");
      }
    } catch (error) {
      console.error("Error loading offline forms:", error);
    }
  };

  useEffect(() => {
    NetInfo.fetch().then((state) => {
      setIsOffline(!state.isConnected);
      if (state.isConnected) {
        fetchForms();
      } else {
        loadFormsOffline();
      }
    });
  }, []);

  const handleFormPress = (item) => {
    router.push({
      pathname: "/format-screen",
      params: { id: item.id, created_at: item.created_at }, // Pass parameters correctly
    });
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.setItem("isLoggedOut", "true"); // Mark the session as logged out
      router.push("/"); // Navigate back to the Main screen
    } catch (error) {
      console.error("Error logging out:", error);
      Alert.alert("Error", "Failed to log out. Please try again.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Available Forms</Text>
      <Text style={isOffline ? styles.offlineText : styles.onlineText}>
        Status: {isOffline ? "Offline" : "Online"}
      </Text>
      {loading ? (
        <Text>Loading...</Text>
      ) : (
        <FlatList
          data={showForms}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.formItem}
              onPress={() => handleFormPress(item)}
            >
              <Text style={styles.formName}>
                ID: {item.id} | Created: {item.created_at}
              </Text>
              <Text style={styles.formAction}>Fill Form</Text>
            </TouchableOpacity>
          )}
        />
      )}
      <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "white" },
  header: { fontSize: 20, fontWeight: "bold", marginBottom: 10 },
  onlineText: { color: "green", fontWeight: "bold", marginBottom: 10 },
  offlineText: { color: "red", fontWeight: "bold", marginBottom: 10 },
  formItem: {
    padding: 15,
    marginBottom: 10,
    backgroundColor: "#f0f0f0",
    borderRadius: 10,
  },
  formName: { fontSize: 16, fontWeight: "bold" },
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
