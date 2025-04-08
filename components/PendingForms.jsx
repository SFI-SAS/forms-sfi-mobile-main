import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

export default function PendingForms() {
  const [pendingForms, setPendingForms] = useState([]);
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    const fetchPendingForms = async () => {
      const storedPendingForms = await AsyncStorage.getItem("pending_forms");
      setPendingForms(storedPendingForms ? JSON.parse(storedPendingForms) : []);
    };

    const checkNetworkStatus = async () => {
      const state = await NetInfo.fetch();
      setIsOnline(state.isConnected);

      if (state.isConnected) {
        // Synchronize pending forms
        for (const form of pendingForms) {
          handleSubmitPendingForm(form);
        }
      }
    };

    fetchPendingForms();
    checkNetworkStatus();
  }, []);

  const handleSubmitPendingForm = async (form) => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");

      const requestOptions = {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      };

      // Submit the form
      const saveResponseRes = await fetch(
        `https://54b8-179-33-13-68.ngrok-free.app/responses/save-response/${form.id}`,
        {
          method: "POST",
          headers: requestOptions.headers,
          body: JSON.stringify({ mode: "offline" }),
        }
      );

      const saveResponseData = await saveResponseRes.json();
      const responseId = saveResponseData.response_id;

      // Submit each answer
      for (const response of form.responses) {
        await fetch(
          `https://54b8-179-33-13-68.ngrok-free.app/responses/save-answers`,
          {
            method: "POST",
            headers: requestOptions.headers,
            body: JSON.stringify({
              response_id: responseId,
              question_id: response.question_id,
              answer_text: response.answer_text,
              file_path: response.file_path,
            }),
          }
        );
      }

      // Remove the form from pending forms
      const updatedPendingForms = pendingForms.filter((f) => f.id !== form.id);
      setPendingForms(updatedPendingForms);
      await AsyncStorage.setItem(
        "pending_forms",
        JSON.stringify(updatedPendingForms)
      );

      Alert.alert("Éxito", "Formulario enviado correctamente.");
    } catch (error) {
      console.error("❌ Error al enviar el formulario pendiente:", error);
      Alert.alert("Error", "No se pudo enviar el formulario pendiente.");
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Formularios Pendientes</Text>
      {pendingForms.length === 0 ? (
        <Text style={styles.noPendingText}>
          No hay formularios en estado offline pendientes.
        </Text>
      ) : (
        pendingForms.map((form, index) => (
          <View key={index} style={styles.formItem}>
            <Text style={styles.formText}>Formulario ID: {form.id}</Text>
            <TouchableOpacity
              style={styles.submitButton}
              onPress={() => handleSubmitPendingForm(form)}
              disabled={!isOnline}
            >
              <Text style={styles.submitButtonText}>
                {isOnline ? "Enviar" : "Sin conexión"}
              </Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#ffffff" },
  header: { fontSize: 20, fontWeight: "bold", marginBottom: 10 },
  noPendingText: { fontSize: 16, color: "#555", textAlign: "center" },
  formItem: {
    padding: 10,
    backgroundColor: "#f0f0f0",
    borderRadius: 5,
    marginBottom: 10,
  },
  formText: { fontSize: 16, fontWeight: "bold" },
  submitButton: {
    marginTop: 10,
    padding: 10,
    backgroundColor: "#2563eb",
    borderRadius: 5,
    alignItems: "center",
  },
  submitButtonText: { color: "white", fontWeight: "bold" },
});
