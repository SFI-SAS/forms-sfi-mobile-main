import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  BackHandler,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { HomeIcon } from "./Icons";

export default function MyForms() {
  const [submittedForms, setSubmittedForms] = useState([]);
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
    handleViewForms();
  }, []);

  const handleViewForms = async () => {
    try {
      const accessToken = await AsyncStorage.getItem("authToken");
      if (!accessToken) {
        console.error("Error: No hay token de acceso disponible.");
        return;
      }

      const response = await fetch(
        `https://ab11-179-33-13-68.ngrok-free.app/forms/users/completed_forms`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!response.ok) {
        throw new Error("Error al cargar formularios enviados.");
      }

      const data = await response.json();
      setSubmittedForms(data || []);
    } catch (error) {
      console.error("❌ Error al cargar formularios enviados:", error);
      Alert.alert("Error", "No se pudieron cargar los formularios enviados.");
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Formularios Enviados</Text>
      {submittedForms.length === 0 ? (
        <Text style={styles.noFormsText}>
          No hay formularios enviados disponibles.
        </Text>
      ) : (
        submittedForms.map((form, index) => (
          <View key={index} style={styles.formItem}>
            <Text style={styles.formText}>Formulario ID: {form.id}</Text>
            <Text style={styles.formDescription}>
              Título: {form.title || "Sin título"}
            </Text>
            <Text style={styles.formDescription}>
              Fecha de envío: {form.submission_date || "Desconocida"}
            </Text>
            <Text style={styles.formDescription}>
              Hora de envío: {form.submission_time || "Desconocida"}
            </Text>
          </View>
        ))
      )}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.push("/home")}
      >
        <Text style={styles.backButtonText}>
          <HomeIcon color={"white"} />
          {"  "}
          Home
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#ffffff" },
  header: { fontSize: 20, fontWeight: "bold", marginBottom: 10 },
  noFormsText: { fontSize: 16, color: "#555", textAlign: "center" },
  formItem: {
    padding: 10,
    backgroundColor: "#f0f0f0",
    borderRadius: 5,
    marginBottom: 10,
  },
  formText: { fontSize: 16, fontWeight: "bold" },
  formDescription: { fontSize: 14, color: "#555" },
  backButton: {
    marginTop: 20,
    padding: 10,
    backgroundColor: "blue",
    borderRadius: 5,
    alignItems: "center",
  },
  backButtonText: {
    color: "white",
    fontWeight: "bold",
  },
});
