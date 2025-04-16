import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  BackHandler,
  Dimensions, // Import Dimensions
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router"; // Add this import
import { HomeIcon } from "./Icons"; // Adjust the import path as necessary

const { width, height } = Dimensions.get("window"); // Get screen dimensions

export default function PendingForms() {
  const [pendingForms, setPendingForms] = useState([]);
  const [isOnline, setIsOnline] = useState(false);
  const router = useRouter();

  useFocusEffect(
    React.useCallback(() => {
      const disableBack = () => true; // Disable hardware back button
      BackHandler.addEventListener("hardwareBackPress", disableBack);

      return () => {
        BackHandler.removeEventListener("hardwareBackPress", disableBack);
      };
    }, [])
  );

  useEffect(() => {
    const fetchPendingForms = async () => {
      const storedPendingForms = await AsyncStorage.getItem("pending_forms");
      setPendingForms(storedPendingForms ? JSON.parse(storedPendingForms) : []);
    };

    const synchronizePendingForms = async () => {
      if (!isOnline) return;

      const storedPendingForms = await AsyncStorage.getItem("pending_forms");
      const pendingForms = storedPendingForms
        ? JSON.parse(storedPendingForms)
        : [];

      const successfullySentForms = [];

      for (const form of pendingForms) {
        try {
          await handleSubmitPendingForm(form);
          successfullySentForms.push(form.id); // Track successfully sent forms
        } catch (error) {
          console.error("❌ Error al sincronizar formulario pendiente:", error);
        }
      }

      // Remove successfully sent forms from the pending list
      const updatedPendingForms = pendingForms.filter(
        (form) => !successfullySentForms.includes(form.id)
      );
      setPendingForms(updatedPendingForms);
      await AsyncStorage.setItem(
        "pending_forms",
        JSON.stringify(updatedPendingForms)
      );
    };

    fetchPendingForms();
    synchronizePendingForms();
  }, [isOnline]);

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
        `https://35b3-179-33-13-68.ngrok-free.app/responses/save-response/${form.id}?mode=offline`,
        {
          method: "POST",
          headers: requestOptions.headers,
        }
      );

      const saveResponseData = await saveResponseRes.json();
      const responseId = saveResponseData.response_id;

      // Submit each answer
      for (const response of form.responses) {
        await fetch(
          `https://35b3-179-33-13-68.ngrok-free.app/responses/save-answers`,
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

      console.log(`✅ Formulario ID ${form.id} enviado correctamente.`);
    } catch (error) {
      console.error(`❌ Error al enviar formulario ID ${form.id}:`, error);
      throw error; // Re-throw the error to handle it in the synchronization logic
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
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.push("/home")}
      >
        <HomeIcon color={"white"} />
        {"  "}
        <Text style={styles.backButtonText}>Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: width * 0.05, backgroundColor: "#ffffff" },
  header: {
    fontSize: width * 0.06,
    fontWeight: "bold",
    marginBottom: height * 0.02,
  },
  noPendingText: {
    fontSize: width * 0.045,
    color: "#555",
    textAlign: "center",
  },
  formItem: {
    padding: width * 0.04,
    backgroundColor: "#f0f0f0",
    borderRadius: width * 0.02,
    marginBottom: height * 0.02,
  },
  formText: { fontSize: width * 0.05, fontWeight: "bold" },
  submitButton: {
    marginTop: height * 0.01,
    padding: height * 0.02,
    backgroundColor: "#2563eb",
    borderRadius: width * 0.02,
    alignItems: "center",
  },
  submitButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045,
  },
  backButton: {
    marginTop: height * 0.03,
    padding: height * 0.02,
    backgroundColor: "blue",
    borderRadius: width * 0.02,
    alignItems: "center",
  },
  backButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045,
  },
});
