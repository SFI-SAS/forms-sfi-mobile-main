import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function MyForms() {
  const [completedForms, setCompletedForms] = useState([]);
  const [pendingForms, setPendingForms] = useState([]);

  const loadForms = async () => {
    try {
      const storedCompletedForms = await AsyncStorage.getItem("completed_forms");
      const storedPendingForms = await AsyncStorage.getItem("pending_forms");

      setCompletedForms(storedCompletedForms ? JSON.parse(storedCompletedForms) : []);
      setPendingForms(storedPendingForms ? JSON.parse(storedPendingForms) : []);
    } catch (error) {
      console.error("❌ Error cargando formularios:", error);
      Alert.alert("Error", "No se pudieron cargar los formularios.");
    }
  };

  useEffect(() => {
    loadForms();
  }, []);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Formularios Diligenciados</Text>
      {completedForms.map((form, index) => (
        <View key={index} style={styles.formItem}>
          <Text style={styles.formText}>ID: {form.id}</Text>
          <Text style={styles.formText}>Preguntas: {form.questions.length}</Text>
          <Text style={styles.formText}>Estado: Enviado</Text>
        </View>
      ))}

      <Text style={styles.header}>Formularios Pendientes de Envío</Text>
      {pendingForms.map((form, index) => (
        <View key={index} style={styles.formItem}>
          <Text style={styles.formText}>ID: {form.id}</Text>
          <Text style={styles.formText}>Preguntas: {form.questions.length}</Text>
          <Text style={styles.formText}>Estado: Pendiente de Envío</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#ffffff" },
  header: { fontSize: 20, fontWeight: "bold", marginBottom: 10 },
  formItem: {
    padding: 10,
    backgroundColor: "#f0f0f0",
    borderRadius: 5,
    marginBottom: 10,
  },
  formText: { fontSize: 16, fontWeight: "bold" },
});
