import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function MyForms() {
  const [completedForms, setCompletedForms] = useState([]);

  const loadCompletedForms = async () => {
    try {
      const storedForms = await AsyncStorage.getItem("completed_forms");
      if (storedForms) {
        setCompletedForms(JSON.parse(storedForms));
      }
    } catch (error) {
      console.error("Error cargando formularios:", error);
    }
  };

  useEffect(() => {
    loadCompletedForms();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Formularios Diligenciados</Text>
      <FlatList
        data={completedForms}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item }) => (
          <View style={styles.formItem}>
            <Text style={styles.formTitle}>{item.title}</Text>
            <Text style={styles.formDetails}>
              Fecha: {new Date(item.created_at).toLocaleString()}
            </Text>
            <Text style={styles.formDetails}>Estado: {item.status}</Text>
            {item.questions.map((q, index) => (
              <View key={index} style={styles.questionContainer}>
                <Text style={styles.questionText}>{q.question_text}</Text>
                <Text style={styles.answerText}>Respuesta: {q.answer}</Text>
              </View>
            ))}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#ffffff" },
  header: { fontSize: 20, fontWeight: "bold", marginBottom: 10 },
  formItem: {
    padding: 15,
    marginBottom: 10,
    backgroundColor: "#f0f0f0",
    borderRadius: 10,
  },
  formTitle: { fontSize: 16, fontWeight: "bold", marginBottom: 5 },
  formDetails: { fontSize: 14, color: "#555" },
  questionContainer: { marginTop: 10 },
  questionText: { fontSize: 14, fontWeight: "bold" },
  answerText: { fontSize: 14, color: "#333" },
});
