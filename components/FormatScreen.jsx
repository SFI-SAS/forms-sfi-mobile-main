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
import * as DocumentPicker from "expo-document-picker"; // Importar DocumentPicker

export default function FormatScreen() {
  const router = useRouter();
  const { id, created_at } = useLocalSearchParams();
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);

  const handleQuestionsByIdForm = async (formId) => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");

      const response = await fetch(
        `https://d1b1-179-33-13-68.ngrok-free.app/forms/${formId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();
      if (!response.ok)
        throw new Error(data.detail || "Error fetching questions");

      setQuestions(data.questions);
      await AsyncStorage.setItem(
        `questions_form_${formId}`,
        JSON.stringify(data.questions)
      );
    } catch (error) {
      console.error("Error fetching questions:", error.message);
      Alert.alert(
        "Error",
        "Failed to fetch questions. Loading offline data..."
      );
      loadQuestionsOffline(formId);
    } finally {
      setLoading(false);
    }
  };

  const loadQuestionsOffline = async (formId) => {
    try {
      const storedQuestions = await AsyncStorage.getItem(
        `questions_form_${formId}`
      );
      if (storedQuestions) {
        setQuestions(JSON.parse(storedQuestions));
      }
    } catch (error) {
      console.error("Error loading offline questions:", error.message);
    }
  };

  const handleAnswerChange = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleFileUpload = async (questionId) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*", // Permitir cualquier tipo de archivo
        copyToCacheDirectory: true,
      });

      if (result.type === "success") {
        console.log("Archivo seleccionado:", result);
        handleAnswerChange(questionId, result.uri); // Guardar la URI del archivo en las respuestas
        Alert.alert("Archivo seleccionado", `Nombre: ${result.name}`);
      } else {
        console.log("Selección de archivo cancelada.");
      }
    } catch (error) {
      console.error("Error seleccionando archivo:", error);
      Alert.alert("Error", "No se pudo seleccionar el archivo.");
    }
  };

  const handleSubmitForm = async () => {
    try {
      const timestamp = new Date().toISOString();
      const isOnline = !isOffline ? "Online" : "Offline";

      const completedForm = {
        id,
        title: `Formulario ${id}`,
        created_at: timestamp,
        status: isOnline,
        questions: questions.map((q) => ({
          question_text: q.question_text,
          answer: answers[q.id] || "Sin respuesta",
        })),
      };

      const storedForms = await AsyncStorage.getItem("completed_forms");
      const forms = storedForms ? JSON.parse(storedForms) : [];
      forms.push(completedForm);

      await AsyncStorage.setItem("completed_forms", JSON.stringify(forms));
      Alert.alert("Formulario guardado", "El formulario se guardó correctamente.");
      router.back();
    } catch (error) {
      console.error("Error guardando el formulario:", error);
      Alert.alert("Error", "No se pudo guardar el formulario.");
    }
  };

  useEffect(() => {
    if (id) {
      handleQuestionsByIdForm(id);
    }
  }, [id]);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Formulario</Text>
      <Text>ID: 00{id}</Text>
      <Text>Creado el: {created_at}</Text>
      <Text style={styles.subHeader}>Preguntas</Text>
      {loading ? (
        <Text>Cargando preguntas...</Text>
      ) : (
        questions.map((question) => (
          <View key={question.id} style={styles.questionContainer}>
            <Text style={styles.questionLabel}>
              {question.question_text}
              {question.required && (
                <Text style={styles.requiredText}> Obligatorio *</Text>
              )}
            </Text>
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
              <DateTimePicker
                value={answers[question.id] || new Date()}
                mode="date"
                display="default"
                onChange={(event, selectedDate) =>
                  handleAnswerChange(question.id, selectedDate)
                }
              />
            )}
            {question.question_type === "select" && question.options && (
              <Picker
                selectedValue={answers[question.id] || ""}
                onValueChange={(value) =>
                  handleAnswerChange(question.id, value)
                }
                style={styles.picker}
              >
                <Picker.Item label="Selecciona una opción" value="" />
                {question.options.map((option, index) => (
                  <Picker.Item
                    key={index}
                    label={option.option_text}
                    value={option.option_text}
                  />
                ))}
              </Picker>
            )}
            {question.question_type === "single_choice" &&
              question.options && (
                <View style={styles.radioGroup}>
                  {question.options.map((option, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.radioOption,
                        answers[question.id] === option.option_text &&
                          styles.radioOptionSelected,
                      ]}
                      onPress={() =>
                        handleAnswerChange(question.id, option.option_text)
                      }
                    >
                      <Text
                        style={[
                          styles.radioText,
                          answers[question.id] === option.option_text &&
                            styles.radioTextSelected,
                        ]}
                      >
                        {option.option_text}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            {question.question_type === "multiple_choice" &&
              question.options && (
                <View style={styles.radioGroup}>
                  {question.options.map((option, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.radioOption,
                        answers[question.id] === option.option_text &&
                          styles.radioOptionSelected,
                      ]}
                      onPress={() =>
                        handleAnswerChange(question.id, option.option_text)
                      }
                    >
                      <Text
                        style={[
                          styles.radioText,
                          answers[question.id] === option.option_text &&
                            styles.radioTextSelected,
                        ]}
                      >
                        {option.option_text}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            {question.question_type === "file" && (
              <TouchableOpacity
                style={styles.fileButton}
                onPress={() => handleFileUpload(question.id)}
              >
                <Text style={styles.fileButtonText}>Subir archivo</Text>
              </TouchableOpacity>
            )}
          </View>
        ))
      )}
      <TouchableOpacity style={styles.submitButton} onPress={handleSubmitForm}>
        <Text style={styles.submitButtonText}>Guardar Formulario</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
      >
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
  questionLabel: { fontSize: 16, fontWeight: "bold", marginBottom: 5 },
  requiredText: { color: "red", fontWeight: "bold" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    padding: 10,
    backgroundColor: "#f9f9f9",
  },
  radioGroup: {
    flexDirection: "column",
    marginTop: 10,
  },
  radioOption: {
    padding: 10,
    marginVertical: 5,
    backgroundColor: "#f0f0f0",
    borderRadius: 5,
    alignItems: "center",
  },
  radioOptionSelected: {
    backgroundColor: "#2563eb",
  },
  radioText: { fontSize: 14, color: "#333" },
  radioTextSelected: { color: "white", fontWeight: "bold" },
  fileButton: {
    backgroundColor: "#2563eb",
    padding: 10,
    borderRadius: 5,
    alignItems: "center",
    marginTop: 10,
  },
  fileButtonText: { color: "white", fontWeight: "bold" },
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
