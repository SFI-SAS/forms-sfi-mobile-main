import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { Picker } from "@react-native-picker/picker";

export default function FormatScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams(); // Recibir el ID del formulario como parámetro
  const { title } = useLocalSearchParams(); // Recibir el ID del formulario como parámetro
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchQuestionsByFormId = async (formId) => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");

      const response = await fetch(
        `https://583d-179-33-13-68.ngrok-free.app/forms/${formId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();
      console.log("📋 Respuesta del endpoint para preguntas:", data); // Debugger

      if (!response.ok)
        throw new Error(data.detail || "Error fetching questions");

      setQuestions(data.questions);
    } catch (error) {
      console.error("❌ Error al obtener las preguntas:", error.message);
      Alert.alert("Error", "No se pudieron cargar las preguntas.");
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerChange = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleFileUpload = async (questionId) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (result.type === "success") {
        handleAnswerChange(questionId, result.uri);
        Alert.alert("Archivo seleccionado", `Nombre: ${result.name}`);
      }
    } catch (error) {
      console.error("❌ Error seleccionando archivo:", error);
      Alert.alert("Error", "No se pudo seleccionar el archivo.");
    }
  };

  useEffect(() => {
    if (id) {
      fetchQuestionsByFormId(id);
    }
  }, [id]);

  const handleSubmitForm = async () => {
    try {
      const completedForm = {
        id,
        questions: questions.map((q) => ({
          question_text: q.question_text,
          answer: answers[q.id] || "Sin respuesta",
        })),
      };

      const storedForms = await AsyncStorage.getItem("completed_forms");
      const forms = storedForms ? JSON.parse(storedForms) : [];
      forms.push(completedForm);

      await AsyncStorage.setItem("completed_forms", JSON.stringify(forms));
      Alert.alert(
        "Formulario guardado",
        "El formulario se guardó correctamente."
      );
      router.back();
    } catch (error) {
      console.error("❌ Error guardando el formulario:", error);
      Alert.alert("Error", "No se pudo guardar el formulario.");
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Formulario: {title.toLocaleUpperCase()}</Text>
      <Text style={styles.header}>ID: 00{id}</Text>
      
      <Text>Responde las preguntas a continuación:</Text>
      <Text>Recuerda que puedes subir archivos (si es necesario).</Text>
      <Text style={styles.subHeader}>Preguntas:</Text>
      <Text></Text>
      {loading ? (
        <Text>Cargando preguntas...</Text>
      ) : (
        questions.map((question) => (
          <View key={question.id} style={styles.questionContainer}>
            <Text style={styles.questionLabel}>{question.question_text}</Text>
            {question.question_type === "text" && (
              <TextInput
                style={styles.input}
                placeholder="Escribe tu respuesta"
                value={answers[question.id] || ""}
                onChangeText={(value) => handleAnswerChange(question.id, value)}
              />
            )}
            {question.question_type === "number" && (
              <TextInput
                style={styles.input}
                placeholder="Escribe un número"
                keyboardType="numeric"
                value={answers[question.id] || ""}
                onChangeText={(value) => handleAnswerChange(question.id, value)}
              />
            )}
            {question.question_type === "date" && (
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => Alert.alert("Seleccionar fecha")}
              >
                <Text style={styles.dateButtonText}>
                  {answers[question.id] || "Seleccionar fecha"}
                </Text>
              </TouchableOpacity>
            )}
            {question.question_type === "file" && (
              <TouchableOpacity
                style={styles.fileButton}
                onPress={() => handleFileUpload(question.id)}
              >
                <Text style={styles.fileButtonText}>
                  {answers[question.id]
                    ? "Archivo seleccionado"
                    : "Subir archivo"}
                </Text>
              </TouchableOpacity>
            )}
            {(question.question_type === "table" ||
              question.question_type === "multiple_choice" ||
              question.question_type === "single_choice") &&
              question.options && (
                <Picker
                  selectedValue={answers[question.id] || ""}
                  onValueChange={(value) => handleAnswerChange(question.id, value)}
                  style={styles.picker}
                >
                  <Picker.Item label="Selecciona una opción" value="" />
                  {question.options.map((option, index) => (
                    <Picker.Item key={index} label={option} value={option} />
                  ))}
                </Picker>
              )}
          </View>
        ))
      )}
      <TouchableOpacity style={styles.submitButton} onPress={handleSubmitForm}>
        <Text style={styles.submitButtonText}>Guardar Formulario</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backButtonText}>Volver</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#ffffff" },
  header: { fontSize: 20, fontWeight: "bold", marginBottom: 10 },
  subHeader: { fontSize: 18, fontWeight: "bold", marginTop: 20 },
  questionContainer: { marginBottom: 20 },
  questionLabel: { fontSize: 25, fontWeight: "bold", marginBottom: 5 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    padding: 10,
    backgroundColor: "#f9f9f9",
  },
  picker: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    backgroundColor: "#f9f9f9",
    marginTop: 10,
  },
  fileButton: {
    backgroundColor: "#2563eb",
    padding: 10,
    borderRadius: 5,
    alignItems: "center",
    marginTop: 10,
  },
  fileButtonText: { color: "white", fontWeight: "bold" },
  dateButton: {
    backgroundColor: "#2563eb",
    padding: 10,
    borderRadius: 5,
    alignItems: "center",
    marginTop: 10,
  },
  dateButtonText: { color: "white", fontWeight: "bold" },
  submitButton: {
    marginTop: 20,
    padding: 10,
    backgroundColor: "green",
    borderRadius: 5,
    alignItems: "center",
  },
  submitButtonText: { color: "white", fontWeight: "bold" },
  backButton: {
    marginTop: 20,
    padding: 10,
    backgroundColor: "blue",
    borderRadius: 5,
    alignItems: "center",
  },
  backButtonText: { color: "white", fontWeight: "bold" },
});
