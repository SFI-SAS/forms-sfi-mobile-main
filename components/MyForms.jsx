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
    const fetchSubmittedForms = async () => {
      try {
        const storedSubmittedForms =
          await AsyncStorage.getItem("submitted_forms");
        setSubmittedForms(
          storedSubmittedForms ? JSON.parse(storedSubmittedForms) : []
        );
      } catch (error) {
        console.error("❌ Error al cargar formularios enviados:", error);
        Alert.alert("Error", "No se pudieron cargar los formularios enviados.");
      }
    };

    fetchSubmittedForms();
  }, []);

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
              Fecha de envío: {form.submitted_at || "Desconocida"}
            </Text>
          </View>
        ))
      )}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.push("/home")}
      >
        <Text style={styles.backButtonText}>Volver al Home</Text>
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
